"""Parse multi-column 'N° Matricula | Razon social' lists from Fundempresa PDFs.
usage: matlist.py file.pdf out.json [first_page]
Writes [{matricula, razon_social, page, col}] ."""
import sys, re, json, pdfplumber, statistics

MAT = re.compile(r'^\d{8}$')
HDR = re.compile(r'N\S?\s*Matr\S*cula\s*Raz\S*n\s*social/?\s*(Denominaci\S*n/?\s*Nombre)?\s*', re.I)


def lines_of(words, tol=2.5):
    words = sorted(words, key=lambda w: (w['top'], w['x0']))
    out = []
    for w in words:
        if out and abs(out[-1]['top'] - w['top']) <= tol:
            out[-1]['words'].append(w)
        else:
            out.append({'top': w['top'], 'words': [w]})
    for l in out:
        l['text'] = ' '.join(x['text'] for x in sorted(l['words'], key=lambda x: x['x0']))
    return out


def assign(mats, lines, mode):
    # DP: partition lines (ordered) into len(mats) consecutive groups (size 0..5)
    M, L = len(mats), len(lines)
    INF = 1e18
    dp = [[INF] * (L + 1) for _ in range(M + 1)]
    bk = [[0] * (L + 1) for _ in range(M + 1)]
    dp[0][0] = 0
    # lines before first mat may be skipped (header): allow leading skip with cost
    for j in range(1, L + 1):
        dp[0][j] = dp[0][j - 1] + 30
    for i in range(1, M + 1):
        mt = mats[i - 1]['top']
        for j in range(0, L + 1):
            best, bj = INF, 0
            for k in range(0, min(6, j) + 1):
                prev = dp[i - 1][j - k]
                if prev >= INF: continue
                if k == 0:
                    c = 40
                else:
                    tops = [lines[x]['top'] for x in range(j - k, j)]
                    ref = tops[0] if mode == 'top' else (tops[0] + tops[-1]) / 2
                    c = abs(ref - mt) * 3 + (k - 1) * 0.5
                if prev + c < best: best, bj = prev + c, k
            dp[i][j], bk[i][j] = best, bj
    # trailing lines may be skipped (footer)
    j = min(range(L + 1), key=lambda j: dp[M][j] + (L - j) * 30)
    res = []
    for i in range(M, 0, -1):
        k = bk[i][j]
        res.append(' '.join(lines[x]['text'] for x in range(j - k, j)))
        j -= k
    return res[::-1]


def main(path, out, first=0):
    pdf = pdfplumber.open(path)
    allrows = []
    stats = {'top': 0, 'center': 0}
    for pi in range(first, len(pdf.pages)):
        p = pdf.pages[pi]
        ws = p.extract_words(keep_blank_chars=False, y_tolerance=1)
        mats = [w for w in ws if MAT.match(w['text'])]
        if not mats:
            p.close(); continue
        # column anchors from mat x0
        xs = sorted(set(round(w['x0']) for w in mats))
        anchors = []
        for x in xs:
            if not anchors or x - anchors[-1][-1] > 20: anchors.append([x])
            else: anchors[-1].append(x)
        anchors = [min(a) for a in anchors]
        bounds = anchors + [p.width + 1]
        matids = set(id(w) for w in mats)
        for ci, a in enumerate(anchors):
            lo, hi = a - 6, bounds[ci + 1] - 6
            cm = sorted([w for w in mats if lo <= w['x0'] < hi], key=lambda w: w['top'])
            nw = [w for w in ws if lo <= w['x0'] < hi and id(w) not in matids]
            if not cm: continue
            top_lo, top_hi = cm[0]['top'] - 14, cm[-1]['top'] + 14
            nw = [w for w in nw if top_lo <= w['top'] <= top_hi]
            ls = lines_of(nw)
            ltops = [l['top'] for l in ls]
            aligned = sum(1 for m in cm if any(abs(m['top'] - t) <= 1.5 for t in ltops))
            mode = 'top' if aligned >= 0.85 * len(cm) else 'center'
            stats[mode] += 1
            names = assign(cm, ls, mode)
            for m, n in zip(cm, names):
                n = HDR.sub('', n).strip()
                if any(r['matricula'] == m['text'] for r in allrows[-400:]):
                    continue  # pages repeat the previous page's last column
                allrows.append({'matricula': m['text'], 'razon_social': n, 'page': pi + 1, 'col': ci})
        p.close()
    json.dump(allrows, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
    print(path, 'rows', len(allrows), 'empty names', sum(1 for r in allrows if not r['razon_social']), 'modes', stats,
          'dup mats', len(allrows) - len(set(r['matricula'] for r in allrows)))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 0)
