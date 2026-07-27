# Gobernanza y precisión

- Temperatura 0: no inventes requisitos, entidades, endpoints, env vars, estados, librerías ni
  comandos. Lo no respaldado por `prompt/`, ADR, diagramas o código no se asume.
- Detente y pregunta ante: falta de información crítica, contradicción entre documentos, diagrama
  ambiguo, o decisión que afecta producción y no está especificada.
- El código real y los ADR (`docs/decisions/`) gobiernan sobre los prompts cuando difieren.
  Obsoletos de `prompt/index.md`: §6 Express, §10 workers pg-boss, §8 .zip.
- No declares algo "hecho" sin evidencia ejecutada. No presentes éxito parcial como total.
- Cambios destructivos o irreversibles (migraciones en prod, DROP, `git push`, DDL en Neon,
  recursos cloud, secretos) requieren aprobación explícita: detente en ese punto.
- Revisa el diff dos veces antes de cerrar una fase.
