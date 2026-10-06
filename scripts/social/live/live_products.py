"""Los productos de las ventas en vivo y el rubro al que pertenece cada uno.

Separado del resto del léxico porque es la lista que más crece: cada noche nueva
trae productos que todavía no están. Se aplica sobre texto plegado (`fold`).
"""

from __future__ import annotations

import re

from live_fold import fold


# ----------------------------------------------------------------- rubros

RUBROS: dict[str, str] = {
    "ROPA_MUJER": "Ropa de mujer",
    "ROPA_VARON": "Ropa de varón",
    "ROPA_INFANTIL": "Ropa infantil",
    "ROPA_GENERAL": "Ropa (sin género declarado)",
    "ROPA_USADA": "Ropa usada y fardos",
    "CALZADO": "Calzado",
    "COSMETICOS": "Cosméticos y cuidado personal",
    "PERFUMES": "Perfumes",
    "BISUTERIA": "Bisutería y accesorios",
    "CARTERAS": "Carteras, mochilas y bolsos",
    "CELULARES": "Celulares y sus accesorios",
    "ELECTRONICA": "Electrónica y electrodomésticos",
    "HOGAR": "Hogar y cocina",
    "JUGUETES": "Juguetes y peluches",
    "BEBES": "Bebés",
    "ALIMENTOS": "Alimentos y postres",
    "SUPLEMENTOS": "Suplementos y productos naturales",
    "MASCOTAS": "Mascotas",
    "VEHICULOS": "Vehículos, motos y repuestos",
    "INMUEBLES": "Inmuebles y lotes",
    "SERVICIOS": "Servicios",
    "SORTEOS": "Sorteos y rifas",
    "PLANTAS": "Plantas y jardín",
    "PAPELERIA": "Papelería y útiles",
}

# producto (forma plegada, singular o plural) → rubro. Las prendas sin género van a ROPA_GENERAL
# y el género se decide por los marcadores de la sala (`GENDER`).
_PRODUCTS: dict[str, tuple[str, ...]] = {
    "ROPA_GENERAL": (
        "polera", "poleron", "blusa", "vestido", "falda", "short", "jean", "pantalon", "calza", "leggin",
        "buzo", "chamarra", "campera", "abrigo", "chaleco", "top", "body", "conjunto", "pijama", "brasier",
        "boxer", "media", "camisa", "sudadera", "enterizo", "lenceria", "faja", "traje de bano", "bikini",
        "gorra", "gorro", "bufanda", "guante", "chompa", "sueter", "saco", "terno", "corset", "crop",
        "palazo", "jogger", "camiseta", "remera", "overol", "kimono", "tapado", "pollera", "manta", "canguro",
        "rompevientos", "chaqueta", "parka",
        "ropa interior", "ropa", "prenda", "tela",
    ),
    "ROPA_USADA": ("fardo", "paca", "ropa americana", "americana", "ropa usada", "segunda mano", "saldo"),
    "CALZADO": (
        "zapato", "zapatilla", "zapatito", "tenis", "sandalia", "bota", "botin", "chinela", "tacon", "taco",
        "crocs", "mocasin", "calzado", "plataforma",
    ),
    "COSMETICOS": (
        "maquillaje", "labial", "rimel", "mascara de pestanas", "delineador", "sombra", "rubor", "corrector",
        "polvo compacto", "base liquida", "skincare", "crema", "serum", "protector solar", "bloqueador",
        "shampoo", "acondicionador", "tinte", "esmalte", "una postiza", "unas", "pestana", "keratina",
        "mascarilla", "jabon", "brocha", "paleta", "gloss", "tonico", "exfoliante", "cosmetico",
    ),
    "PERFUMES": ("perfume", "colonia", "fragancia", "body splash", "locion", "splash"),
    "BISUTERIA": (
        "arete", "collar", "pulsera", "anillo", "cadena", "joya", "bisuteria", "piercing", "mono", "monito",
        "gogo", "colet", "pinza", "vincha", "diadema", "lente", "gafa", "reloj", "cinturon", "dije",
        "tobillera", "broche", "scrunchie", "accesorio",
    ),
    "CARTERAS": ("cartera", "mochila", "bolso", "billetera", "maleta", "rinonera", "monedero", "neceser", "tote"),
    "CELULARES": (
        "celular", "iphone", "samsung", "xiaomi", "redmi", "motorola", "funda", "mica", "protector de pantalla",
        "cargador", "telefono",
    ),
    "ELECTRONICA": (
        "audifono", "auricular", "parlante", "luz led", "luces led", "led", "lampara", "camara", "smartwatch",
        "reloj inteligente", "tablet", "laptop", "televisor", "tv", "consola", "mouse", "teclado", "cable",
        "power bank", "ventilador", "plancha", "secadora", "planchita", "rizador", "proyector", "microfono",
        "inversor", "control remoto", "electrodomestico", "licuadora", "batidora", "freidora", "air fryer",
        "hervidor", "microondas", "aspiradora", "etiquetadora", "label maker", "parlantito",
    ),
    "HOGAR": (
        "olla", "sarten", "vaso", "taza", "plato", "termo", "tupper", "toalla", "sabana", "cobija", "frazada",
        "cortina", "almohada", "edredon", "colchon", "organizador", "escoba", "cuchillo", "cubierto", "mantel",
        "alfombra", "florero", "adorno", "cocina", "bowl", "botella", "jarra", "cojin", "cuadro", "espejo",
        "perchero", "canasta", "vela",
    ),
    "JUGUETES": (
        "juguete", "muneca", "peluche", "carrito", "lego", "pelota", "rompecabeza", "slime", "figura",
        "hot wheels", "didactico", "gatito", "osito", "stitch", "labubu", "squishy", "coleccionable",
        "soldadito", "llavero", "munequito", "jirafa", "bluey", "polly pocket", "squeakee", "mario bros",
        "dinosaurio", "robot", "pistola de agua", "barbie", "funko",
    ),
    "BEBES": ("panal", "biberon", "mamadera", "coche de bebe", "cuna", "chupon", "babero", "bebe"),
    "ALIMENTOS": (
        "torta", "postre", "galleta", "chocolate", "dulce", "snack", "cafe", "queso", "salteña", "saltena",
        "gelatina", "helado", "pan", "miel", "frutos secos", "refresco", "comida", "pollo", "carne", "api",
        "empanada", "cuñape", "cunape", "masaco", "golosina", "caramelo",
    ),
    "SUPLEMENTOS": (
        "suplemento", "vitamina", "colageno", "proteina", "naturista", "detox", "moringa", "maca", "capsula",
        "adelgazante", "te verde", "omega",
    ),
    "MASCOTAS": ("mascota", "croqueta", "arena para gato", "cachorro", "correa", "comedero"),
    "VEHICULOS": ("auto", "moto", "llanta", "repuesto", "casco", "aceite de motor", "vagoneta", "camioneta"),
    "INMUEBLES": ("lote", "terreno", "anticretico", "alquiler", "departamento", "casa en venta"),
    "SERVICIOS": ("curso", "clase", "prestamo", "credito", "asesoria", "tramite", "tarot", "lectura de carta"),
    "SORTEOS": ("sorteo", "rifa", "ruleta", "dinamica", "premio"),
    "PLANTAS": ("planta", "maceta", "suculenta", "cactus", "semilla", "piedra", "piedrita", "jardin"),
    "PAPELERIA": ("cuaderno", "utiles", "lapicero", "boligrafo", "sticker", "agenda", "libro", "lapices de colores", "marcador"),
}

# Palabras que dicen el rubro pero no son un producto con precio: «la dinámica» es un juego del
# live, «ropa» o «accesorio» no dicen qué prenda. Cuentan para el rubro de la sala y nunca se
# les asigna un precio.
GENERIC_PRODUCTS = {"ropa", "prenda", "tela", "accesorio", "cosmetico", "electrodomestico", "cocina",
                    "sorteo", "rifa", "ruleta", "dinamica", "premio", "comida", "led", "bebe"}

PRODUCT_RUBRO: dict[str, str] = {}
for _rubro, _words in _PRODUCTS.items():
    for _word in _words:
        PRODUCT_RUBRO[fold(_word)] = _rubro

# plurales simples: «zapatillas», «aretes», «luces» ya están; se agregan las formas en -s/-es
_PRODUCT_PATTERN = re.compile(
    r"\b("
    + "|".join(sorted((re.escape(word) for word in PRODUCT_RUBRO), key=len, reverse=True))
    + r")(?:es|s)?\b"
)

GENDER = {
    "ROPA_MUJER": re.compile(r"\b(dama|damas|mujer|mujeres|senora|chica|chicas|nina grande|femenin)"),
    "ROPA_VARON": re.compile(r"\b(varon|varones|caballero|caballeros|hombre|hombres|masculin)"),
    "ROPA_INFANTIL": re.compile(r"\b(nino|nina|ninos|ninas|infantil|kids|bebe|bebes|guagua)"),
}


def products_in(text: str) -> list[str]:
    """Productos nombrados en un texto plegado, en su forma de diccionario."""
    found = []
    for match in _PRODUCT_PATTERN.finditer(text):
        word = match.group(1)
        if word in PRODUCT_RUBRO:
            found.append(word)
    return found
