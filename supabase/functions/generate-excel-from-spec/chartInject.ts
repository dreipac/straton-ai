// Post-Processing: echte Excel-Diagramme (OOXML), da ExcelJS keine Charts erzeugt.
import JSZip from 'npm:jszip@3.10.1'

export type ChartInjectType = 'column' | 'bar' | 'line'

export type ChartInjectSpec = {
  type: ChartInjectType
  title?: string
  seriesName?: string
  /** Wenn Diagramme auf anderem Blatt: exakter Name des Datenblatts (wie in sheets[].name). */
  sourceSheet?: string
  categoriesRange: string
  valuesRange: string
  anchorCol?: number
  anchorRow?: number
}

const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Wie buildWorkbook: gleiche Sheet-Namen wie ExcelJS. */
export function sanitizeSheetNameForChart(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31)
  return cleaned || 'Tabelle'
}

function sheetRefPrefix(sheetName: string): string {
  const n = sanitizeSheetNameForChart(sheetName)
  if (/^[A-Za-z0-9_]+$/.test(n)) {
    return `${n}!`
  }
  return `'${n.replace(/'/g, "''")}'!`
}

/** A5:A9 oder $A$5:$A$9 → $A$5:$A$9 */
function absolutizeA1Range(range: string): string {
  const p = range.trim().split(':').map((c) => c.trim())
  const fix = (cell: string) => {
    const m = cell.match(/^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})$/i)
    if (!m) {
      throw new Error(`Ungültiger Zellbezug: ${cell}`)
    }
    return `$${m[2].toUpperCase()}$${m[4]}`
  }
  if (p.length === 1) {
    return fix(p[0])
  }
  if (p.length === 2) {
    return `${fix(p[0])}:${fix(p[1])}`
  }
  throw new Error(`Ungültiger Bereich: ${range}`)
}

function nextNumericSuffix(files: string[], re: RegExp): number {
  let max = 0
  for (const f of files) {
    const m = f.match(re)
    if (m) {
      const n = Number(m[1])
      if (n > max) {
        max = n
      }
    }
  }
  return max + 1
}

function buildRichTitleXml(plain: string): string {
  const t = escapeXml(plain)
  return `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr lvl="0"><a:defRPr b="0"><a:solidFill><a:srgbClr val="757575"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:pPr><a:r><a:rPr b="0"><a:solidFill><a:srgbClr val="757575"/></a:solidFill><a:latin typeface="+mn-lt"/></a:rPr><a:t>${t}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`
}

function buildSeriesTxXml(seriesName: string | undefined): string {
  if (!seriesName?.trim()) {
    return ''
  }
  return `<c:tx><c:v>${escapeXml(seriesName.trim())}</c:v></c:tx>`
}

function buildColumnOrBarChartXml(args: {
  barDir: 'col' | 'bar'
  title: string
  catRef: string
  valRef: string
  seriesName?: string
  axIdCat: number
  axIdVal: number
}): string {
  const serTx = buildSeriesTxXml(args.seriesName)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<c:chart>
${buildRichTitleXml(args.title)}
<c:plotArea><c:layout/>
<c:barChart><c:barDir val="${args.barDir}"/><c:grouping val="clustered"/>
<c:ser><c:idx val="0"/><c:order val="0"/>${serTx}
<c:cat><c:strRef><c:f>${args.catRef}</c:f></c:strRef></c:cat>
<c:val><c:numRef><c:f>${args.valRef}</c:f><c:numCache/></c:numRef></c:val>
</c:ser>
<c:axId val="${args.axIdCat}"/><c:axId val="${args.axIdVal}"/>
</c:barChart>
<c:catAx><c:axId val="${args.axIdCat}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:crossAx val="${args.axIdVal}"/></c:catAx>
<c:valAx><c:axId val="${args.axIdVal}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln><a:solidFill><a:srgbClr val="B7B7B7"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:crossAx val="${args.axIdCat}"/></c:valAx>
</c:plotArea>
<c:legend><c:legendPos val="r"/><c:overlay val="0"/></c:legend>
<c:plotVisOnly val="1"/>
</c:chart>
</c:chartSpace>`
}

function buildLineChartXml(args: {
  title: string
  catRef: string
  valRef: string
  seriesName?: string
  axIdCat: number
  axIdVal: number
}): string {
  const serTx = buildSeriesTxXml(args.seriesName)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<c:chart>
${buildRichTitleXml(args.title)}
<c:plotArea><c:layout/>
<c:lineChart>
<c:ser><c:idx val="0"/><c:order val="0"/>${serTx}
<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>
<c:cat><c:strRef><c:f>${args.catRef}</c:f></c:strRef></c:cat>
<c:val><c:numRef><c:f>${args.valRef}</c:f><c:numCache/></c:numRef></c:val>
<c:smooth val="0"/>
</c:ser>
<c:axId val="${args.axIdCat}"/><c:axId val="${args.axIdVal}"/>
</c:lineChart>
<c:catAx><c:axId val="${args.axIdCat}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:crossAx val="${args.axIdVal}"/></c:catAx>
<c:valAx><c:axId val="${args.axIdVal}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln><a:solidFill><a:srgbClr val="B7B7B7"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:crossAx val="${args.axIdCat}"/></c:valAx>
</c:plotArea>
<c:legend><c:legendPos val="r"/><c:overlay val="0"/></c:legend>
<c:plotVisOnly val="1"/>
</c:chart>
</c:chartSpace>`
}

function buildDrawingXml(anchors: Array<{ col: number; row: number; chartRelId: string; name: string; nvId: number }>): string {
  const parts = anchors.map(
    (a) =>
      `<xdr:oneCellAnchor><xdr:from><xdr:col>${a.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="5486400" cy="3200400"/><xdr:graphicFrame><xdr:nvGraphicFramePr><xdr:cNvPr id="${a.nvId}" name="${escapeXml(a.name)}" title="Chart"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="${a.chartRelId}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData fLocksWithSheet="0"/></xdr:oneCellAnchor>`,
  )
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="${DRAWING_NS}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
${parts.join('')}
</xdr:wsDr>`
}

function appendContentTypeOverride(contentTypesXml: string, partName: string, contentType: string): string {
  if (contentTypesXml.includes(`PartName="${partName}"`)) {
    return contentTypesXml
  }
  const insert = `<Override PartName="${partName}" ContentType="${contentType}"/>`
  return contentTypesXml.replace(/<\/Types>\s*$/, `${insert}</Types>`)
}

/**
 * OOXML: drawing muss NACH pageMargins/pageSetup stehen — direkt nach sheetData führt zu Reparatur / kaputtem sheet2.
 */
function ensureWorksheetDrawing(
  sheetXml: string,
  drawingRelId: string,
): { xml: string; changed: boolean } {
  if (/<drawing\s+r:id="/i.test(sheetXml)) {
    return { xml: sheetXml, changed: false }
  }
  if (!/<\/worksheet>/i.test(sheetXml)) {
    throw new Error('Worksheet-XML ohne schließendes worksheet-Tag.')
  }
  const xml = sheetXml.replace(
    /<\/worksheet>/i,
    `<drawing r:id="${drawingRelId}"/></worksheet>`,
  )
  return { xml, changed: true }
}

function parseRelsMaxId(relsXml: string): number {
  let max = 0
  const re = /Id="rId(\d+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(relsXml)) !== null) {
    const n = Number(m[1])
    if (n > max) {
      max = n
    }
  }
  return max
}

function appendWorksheetDrawingRel(
  relsPath: string,
  existing: string | null,
  drawingTarget: string,
): { xml: string; drawingRid: string } {
  const next = (existing ? parseRelsMaxId(existing) : 0) + 1
  const drawingRid = `rId${next}`
  const relLine =
    `<Relationship Id="${drawingRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="${drawingTarget}"/>`
  if (!existing) {
    return {
      xml:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}">${relLine}</Relationships>`,
      drawingRid,
    }
  }
  const closed = existing.replace(
    /<\/Relationships>\s*$/i,
    `${relLine}</Relationships>`,
  )
  return { xml: closed, drawingRid }
}

export type SheetWithCharts = { name: string; charts?: ChartInjectSpec[] }

/**
 * Fügt Diagramme in eine von ExcelJS geschriebene .xlsx ein.
 * Reihenfolge der Blätter muss mit spec.sheets übereinstimmen.
 */
export async function injectChartsIntoXlsx(
  xlsxBytes: Uint8Array,
  sheetsInOrder: SheetWithCharts[],
): Promise<Uint8Array> {
  const anyCharts = sheetsInOrder.some((s) => Array.isArray(s.charts) && s.charts.length > 0)
  if (!anyCharts) {
    return xlsxBytes
  }

  const zip = await JSZip.loadAsync(xlsxBytes)
  const names = Object.keys(zip.files)

  let chartNext = nextNumericSuffix(names, /^xl\/charts\/chart(\d+)\.xml$/i)
  let drawingNext = nextNumericSuffix(names, /^xl\/drawings\/drawing(\d+)\.xml$/i)

  let globalChartKey = 0

  for (let si = 0; si < sheetsInOrder.length; si++) {
    const sheetSpec = sheetsInOrder[si]
    const charts = sheetSpec.charts
    if (!charts?.length) {
      continue
    }

    const sheetPath = `xl/worksheets/sheet${si + 1}.xml`
    const sheetFile = zip.file(sheetPath)
    if (!sheetFile) {
      throw new Error(`Arbeitsblatt ${sheetPath} nicht gefunden (Diagramm-Injection).`)
    }
    let sheetXml = await sheetFile.async('string')
    if (/<drawing\s+r:id="/i.test(sheetXml)) {
      throw new Error(
        `Blatt "${sheetSpec.name}" hat bereits ein drawing — zusätzliche Diagramme werden noch nicht zusammengeführt.`,
      )
    }

    const relsPath = `xl/worksheets/_rels/sheet${si + 1}.xml.rels`
    const prevRels = zip.file(relsPath) ? await zip.file(relsPath)!.async('string') : null
    const drawingFile = `drawings/drawing${drawingNext}.xml`
    const { xml: relsXml, drawingRid } = appendWorksheetDrawingRel(
      relsPath,
      prevRels,
      `../${drawingFile}`,
    )
    zip.file(relsPath, relsXml)

    const { xml: sheetPatched } = ensureWorksheetDrawing(sheetXml, drawingRid)
    zip.file(sheetPath, sheetPatched)

    const anchors: Array<{ col: number; row: number; chartRelId: string; name: string; nvId: number }> = []
    const drawingRelLines: string[] = []
    let drid = 0

    for (let ci = 0; ci < charts.length; ci++) {
      const ch = charts[ci]
      const refSheet =
        typeof ch.sourceSheet === 'string' && ch.sourceSheet.trim()
          ? sanitizeSheetNameForChart(ch.sourceSheet)
          : sheetSpec.name
      const prefix = sheetRefPrefix(refSheet)
      const catAbs = absolutizeA1Range(ch.categoriesRange)
      const valAbs = absolutizeA1Range(ch.valuesRange)
      const catRef = `${prefix}${catAbs}`
      const valRef = `${prefix}${valAbs}`
      const title = (ch.title?.trim() || 'Diagramm') as string
      const axCat = 2_000_000 + globalChartKey * 10
      const axVal = 2_000_001 + globalChartKey * 10
      globalChartKey++

      let chartBody: string
      if (ch.type === 'bar') {
        chartBody = buildColumnOrBarChartXml({
          barDir: 'bar',
          title,
          catRef,
          valRef,
          seriesName: ch.seriesName,
          axIdCat: axCat,
          axIdVal: axVal,
        })
      } else if (ch.type === 'line') {
        chartBody = buildLineChartXml({
          title,
          catRef,
          valRef,
          seriesName: ch.seriesName,
          axIdCat: axCat,
          axIdVal: axVal,
        })
      } else {
        chartBody = buildColumnOrBarChartXml({
          barDir: 'col',
          title,
          catRef,
          valRef,
          seriesName: ch.seriesName,
          axIdCat: axCat,
          axIdVal: axVal,
        })
      }

      const cnum = chartNext++
      const chartPath = `xl/charts/chart${cnum}.xml`
      zip.file(chartPath, chartBody)

      drid++
      const chartRelId = `rId${drid}`
      drawingRelLines.push(
        `<Relationship Id="${chartRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${cnum}.xml"/>`,
      )

      const anchorCol = typeof ch.anchorCol === 'number' && ch.anchorCol >= 0 ? ch.anchorCol : 4
      const baseRow = typeof ch.anchorRow === 'number' && ch.anchorRow >= 0 ? ch.anchorRow : 12
      anchors.push({
        col: anchorCol,
        row: baseRow + ci * 20,
        chartRelId,
        name: `Diagramm ${ci + 1}`,
        nvId: ci + 1,
      })
    }

    const drawingPath = `xl/${drawingFile}`
    zip.file(drawingPath, buildDrawingXml(anchors))
    zip.file(
      `xl/drawings/_rels/drawing${drawingNext}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}">${drawingRelLines.join(
        '',
      )}</Relationships>`,
    )

    const firstChartThisSheet = chartNext - charts.length
    let ct = await zip.file('[Content_Types].xml')!.async('string')
    for (let k = firstChartThisSheet; k < chartNext; k++) {
      ct = appendContentTypeOverride(
        ct,
        `/xl/charts/chart${k}.xml`,
        'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
      )
    }
    ct = appendContentTypeOverride(
      ct,
      `/xl/${drawingFile}`,
      'application/vnd.openxmlformats-officedocument.drawing+xml',
    )
    zip.file('[Content_Types].xml', ct)

    drawingNext++
  }

  const out = await zip.generateAsync({ type: 'uint8array' })
  return out
}
