import QRCode from 'qrcode'
import AlignmentPattern from 'qrcode/lib/core/alignment-pattern.js'
import BitBuffer from 'qrcode/lib/core/bit-buffer.js'
import BitMatrix from 'qrcode/lib/core/bit-matrix.js'
import ECCode from 'qrcode/lib/core/error-correction-code.js'
import FinderPattern from 'qrcode/lib/core/finder-pattern.js'
import FormatInfo from 'qrcode/lib/core/format-info.js'
import Mode from 'qrcode/lib/core/mode.js'
import ReedSolomonEncoder from 'qrcode/lib/core/reed-solomon-encoder.js'
import Utils from 'qrcode/lib/core/utils.js'

const ALPHANUMERIC_CHARS = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  ' ', '$', '%', '*', '+', '-', '.', '/', ':'
]

const MASK_PATTERN_DETAILS = {
  0: {
    label: 'Pattern 000',
    formula: '(row + col) % 2 === 0'
  },
  1: {
    label: 'Pattern 001',
    formula: 'row % 2 === 0'
  },
  2: {
    label: 'Pattern 010',
    formula: 'col % 3 === 0'
  },
  3: {
    label: 'Pattern 011',
    formula: '(row + col) % 3 === 0'
  },
  4: {
    label: 'Pattern 100',
    formula: '(floor(row / 2) + floor(col / 3)) % 2 === 0'
  },
  5: {
    label: 'Pattern 101',
    formula: '((row * col) % 2 + (row * col) % 3) === 0'
  },
  6: {
    label: 'Pattern 110',
    formula: '(((row * col) % 2 + (row * col) % 3) % 2) === 0'
  },
  7: {
    label: 'Pattern 111',
    formula: '(((row * col) % 3 + (row + col) % 2) % 2) === 0'
  }
}

const textDecoder = new TextDecoder()

function toBits(value, length) {
  return value.toString(2).padStart(length, '0')
}

export function getMaskPatternDetails(pattern) {
  return MASK_PATTERN_DETAILS[pattern]
}

function asHex(value) {
  return `0x${value.toString(16).padStart(2, '0').toUpperCase()}`
}

function getSegmentText(segment) {
  if (segment.mode?.id === 'Byte') {
    return textDecoder.decode(segment.data)
  }

  return segment.data
}

function appendNumberBits(buffer, sources, value, length, meta) {
  for (let i = 0; i < length; i++) {
    const bit = ((value >>> (length - i - 1)) & 1) === 1 ? 1 : 0
    buffer.putBit(bit)
    sources.push({
      ...meta,
      value: bit,
      fieldBitIndex: i
    })
  }
}

function describeByte(byte) {
  const char = byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : null
  return char ? `${char} · ${asHex(byte)}` : asHex(byte)
}

export function explainMaskAt(pattern, row, col) {
  const detail = getMaskPatternDetails(pattern)
  const maskBit = getMaskAt(pattern, row, col) ? 1 : 0

  switch (pattern) {
    case 0:
      return {
        ...detail,
        maskBit,
        evaluation: `(${row} + ${col}) % 2 === 0 -> ${(row + col)} % 2 === 0 -> ${(row + col) % 2} === 0 -> ${maskBit === 1}`
      }
    case 1:
      return {
        ...detail,
        maskBit,
        evaluation: `${row} % 2 === 0 -> ${row % 2} === 0 -> ${maskBit === 1}`
      }
    case 2:
      return {
        ...detail,
        maskBit,
        evaluation: `${col} % 3 === 0 -> ${col % 3} === 0 -> ${maskBit === 1}`
      }
    case 3:
      return {
        ...detail,
        maskBit,
        evaluation: `(${row} + ${col}) % 3 === 0 -> ${(row + col)} % 3 === 0 -> ${(row + col) % 3} === 0 -> ${maskBit === 1}`
      }
    case 4: {
      const rowHalf = Math.floor(row / 2)
      const colThird = Math.floor(col / 3)
      const sum = rowHalf + colThird
      return {
        ...detail,
        maskBit,
        evaluation: `(floor(${row} / 2) + floor(${col} / 3)) % 2 === 0 -> (${rowHalf} + ${colThird}) % 2 === 0 -> ${sum % 2} === 0 -> ${maskBit === 1}`
      }
    }
    case 5: {
      const product = row * col
      const left = product % 2
      const right = product % 3
      return {
        ...detail,
        maskBit,
        evaluation: `(((${row} × ${col}) % 2) + ((${row} × ${col}) % 3)) === 0 -> (${left} + ${right}) === 0 -> ${left + right === 0}`
      }
    }
    case 6: {
      const product = row * col
      const left = product % 2
      const right = product % 3
      const sum = left + right
      return {
        ...detail,
        maskBit,
        evaluation: `((((${row} × ${col}) % 2) + ((${row} × ${col}) % 3)) % 2) === 0 -> ((${left} + ${right}) % 2) === 0 -> ${sum % 2} === 0 -> ${maskBit === 1}`
      }
    }
    case 7: {
      const left = (row * col) % 3
      const right = (row + col) % 2
      const sum = left + right
      return {
        ...detail,
        maskBit,
        evaluation: `(((${row} × ${col}) % 3) + ((${row} + ${col}) % 2)) % 2 === 0 -> (${left} + ${right}) % 2 === 0 -> ${sum % 2} === 0 -> ${maskBit === 1}`
      }
    }
    default:
      return {
        ...detail,
        maskBit,
        evaluation: detail?.formula || ''
      }
  }
}

function getByteEncodingSummary(byte) {
  const char = byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : null
  if (char) {
    return `${char} -> UTF-8/ASCII ${byte} -> ${toBits(byte, 8)}`
  }

  return `${asHex(byte)} -> ${byte} -> ${toBits(byte, 8)}`
}

function buildSegmentPayload(segment, descriptor, buffer, sources) {
  const chunks = []
  const modeId = descriptor.mode

  if (modeId === 'Numeric') {
    const value = segment.data

    for (let index = 0; index < value.length; index += 3) {
      const chunk = value.slice(index, index + 3)
      const bits = chunk.length === 3 ? 10 : chunk.length * 3 + 1
      const number = Number.parseInt(chunk, 10)
      const startBit = buffer.getLengthInBits()

      appendNumberBits(buffer, sources, number, bits, {
        kind: 'segment',
        field: 'data',
        segmentId: descriptor.id,
        chunkIndex: chunks.length,
        chunkLabel: chunk
      })

      chunks.push({
        index: chunks.length,
        label: chunk,
        kind: 'numeric-group',
        modeLabel: 'QR Numeric',
        bitLength: bits,
        encodedValue: number,
        bits: toBits(number, bits),
        encodingSummary: `${chunk} -> ${number} -> ${toBits(number, bits)}`,
        startBit,
        endBit: buffer.getLengthInBits()
      })
    }
  } else if (modeId === 'Alphanumeric') {
    const value = segment.data

    for (let index = 0; index < value.length; index += 2) {
      const chunk = value.slice(index, index + 2)
      const bits = chunk.length === 2 ? 11 : 6
      const firstValue = ALPHANUMERIC_CHARS.indexOf(chunk[0])
      const secondValue = chunk.length === 2 ? ALPHANUMERIC_CHARS.indexOf(chunk[1]) : null
      const number = chunk.length === 2
        ? firstValue * 45 + secondValue
        : firstValue
      const startBit = buffer.getLengthInBits()

      appendNumberBits(buffer, sources, number, bits, {
        kind: 'segment',
        field: 'data',
        segmentId: descriptor.id,
        chunkIndex: chunks.length,
        chunkLabel: chunk
      })

      chunks.push({
        index: chunks.length,
        label: chunk,
        kind: 'alphanumeric-group',
        modeLabel: 'QR Alphanumeric',
        bitLength: bits,
        encodedValue: number,
        bits: toBits(number, bits),
        encodingSummary: chunk.length === 2
          ? `${chunk} -> QR Alphanumeric has 45 symbols, so pairs are encoded in base 45 -> ${chunk[0]}=${firstValue}, ${chunk[1]}=${secondValue} -> ${firstValue}×45+${secondValue} = ${number} -> ${toBits(number, bits)}`
          : `${chunk} -> single remaining QR Alphanumeric character -> ${chunk[0]}=${firstValue} -> encoded directly in 6 bits -> ${toBits(number, bits)}`,
        startBit,
        endBit: buffer.getLengthInBits()
      })
    }
  } else {
    const bytes = Array.from(segment.data)

    bytes.forEach((byte, chunkIndex) => {
      const startBit = buffer.getLengthInBits()

      appendNumberBits(buffer, sources, byte, 8, {
        kind: 'segment',
        field: 'data',
        segmentId: descriptor.id,
        chunkIndex,
        chunkLabel: describeByte(byte)
      })

      chunks.push({
        index: chunkIndex,
        label: describeByte(byte),
        kind: 'byte',
        modeLabel: 'QR Byte',
        bitLength: 8,
        encodedValue: byte,
        bits: toBits(byte, 8),
        encodingSummary: getByteEncodingSummary(byte),
        startBit,
        endBit: buffer.getLengthInBits()
      })
    })
  }

  return chunks
}

function buildDataBuffer(segments, version) {
  const buffer = new BitBuffer()
  const sources = []
  let charOffset = 0

  const descriptors = segments.map((segment, id) => {
    const text = getSegmentText(segment)
    const charCountBits = Mode.getCharCountIndicator(segment.mode, version)
    const startBit = buffer.getLengthInBits()
    const modeStart = buffer.getLengthInBits()

    appendNumberBits(buffer, sources, segment.mode.bit, 4, {
      kind: 'segment',
      field: 'mode',
      segmentId: id
    })

    const countStart = buffer.getLengthInBits()
    appendNumberBits(buffer, sources, segment.getLength(), charCountBits, {
      kind: 'segment',
      field: 'count',
      segmentId: id
    })

    const payloadStart = buffer.getLengthInBits()

    const descriptor = {
      id,
      mode: segment.mode.id,
      text,
      length: segment.getLength(),
      characterLength: text.length,
      startChar: charOffset,
      endChar: charOffset + text.length,
      modeBits: 4,
      charCountBits,
      startBit
    }

    descriptor.chunks = buildSegmentPayload(segment, descriptor, buffer, sources)
    descriptor.endBit = buffer.getLengthInBits()
    descriptor.payloadBits = descriptor.endBit - payloadStart
    descriptor.totalBits = descriptor.endBit - startBit
    descriptor.modeBitRange = [modeStart, countStart]
    descriptor.countBitRange = [countStart, payloadStart]
    descriptor.payloadBitRange = [payloadStart, descriptor.endBit]

    charOffset += text.length

    return descriptor
  })

  const segmentBits = buffer.getLengthInBits()

  return {
    buffer,
    sources,
    descriptors,
    segmentBits
  }
}

function addPadding(buffer, sources, capacityBits) {
  const remainingBits = Math.max(capacityBits - buffer.getLengthInBits(), 0)
  const terminatorBits = Math.min(4, remainingBits)

  for (let index = 0; index < terminatorBits; index++) {
    appendNumberBits(buffer, sources, 0, 1, {
      kind: 'terminator'
    })
  }

  let alignmentBits = 0
  while (buffer.getLengthInBits() % 8 !== 0) {
    appendNumberBits(buffer, sources, 0, 1, {
      kind: 'byte-align'
    })
    alignmentBits += 1
  }

  let padBytes = 0
  const padValues = [0xEC, 0x11]
  while (buffer.getLengthInBits() < capacityBits) {
    const value = padValues[padBytes % 2]

    appendNumberBits(buffer, sources, value, 8, {
      kind: 'pad',
      padIndex: padBytes,
      padByteIndex: padBytes,
      padValue: value,
      padBits: toBits(value, 8)
    })

    padBytes += 1
  }

  return {
    terminatorBits,
    alignmentBits,
    padBytes
  }
}

function cloneByteBits(bits, extra) {
  return bits.map((bit, bitIndex) => ({
    ...bit,
    ...extra,
    codewordBitIndex: bitIndex
  }))
}

function buildBlocks(dataBytes, bitSources, version, errorCorrectionLevel) {
  const totalCodewords = Utils.getSymbolTotalCodewords(version)
  const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel)
  const dataTotalCodewords = totalCodewords - ecTotalCodewords
  const totalBlocks = ECCode.getBlocksCount(version, errorCorrectionLevel)
  const blocksInGroup2 = totalCodewords % totalBlocks
  const blocksInGroup1 = totalBlocks - blocksInGroup2
  const totalCodewordsInGroup1 = Math.floor(totalCodewords / totalBlocks)
  const dataCodewordsInGroup1 = Math.floor(dataTotalCodewords / totalBlocks)
  const dataCodewordsInGroup2 = dataCodewordsInGroup1 + 1
  const ecCodewordsPerBlock = totalCodewordsInGroup1 - dataCodewordsInGroup1
  const rs = new ReedSolomonEncoder(ecCodewordsPerBlock)

  const blocks = []
  let offset = 0

  for (let blockIndex = 0; blockIndex < totalBlocks; blockIndex++) {
    const group = blockIndex < blocksInGroup1 ? 1 : 2
    const dataSize = group === 1 ? dataCodewordsInGroup1 : dataCodewordsInGroup2
    const rawData = dataBytes.slice(offset, offset + dataSize)
    const encodedError = Array.from(rs.encode(Uint8Array.from(rawData)))
    const label = `G${group} · B${group === 1 ? blockIndex + 1 : blockIndex - blocksInGroup1 + 1}`

    const dataCodewords = rawData.map((value, localIndex) => {
      const globalByteIndex = offset + localIndex
      const bitMeta = cloneByteBits(
        bitSources.slice(globalByteIndex * 8, globalByteIndex * 8 + 8),
        {
          blockId: blockIndex,
          blockLabel: label,
          localCodewordIndex: localIndex,
          codewordRole: 'data'
        }
      )

      return {
        value,
        localIndex,
        globalByteIndex,
        bitMeta,
        bits: toBits(value, 8)
      }
    })

    const errorCodewords = encodedError.map((value, localIndex) => {
      const bitMeta = Array.from({ length: 8 }, (_, bitIndex) => ({
        kind: 'error-correction',
        value: (value >>> (7 - bitIndex)) & 1,
        fieldBitIndex: bitIndex,
        blockId: blockIndex,
        blockLabel: label,
        localCodewordIndex: localIndex,
        codewordRole: 'error-correction'
      }))

      return {
        value,
        localIndex,
        bitMeta,
        bits: toBits(value, 8)
      }
    })

    blocks.push({
      id: blockIndex,
      label,
      group,
      dataCodewords,
      errorCodewords,
      dataCodewordCount: dataCodewords.length,
      errorCodewordCount: errorCodewords.length,
      sourcePreview: dataCodewords.slice(0, 6).map((item) => asHex(item.value)).join(' ')
    })

    offset += dataSize
  }

  const maxDataSize = Math.max(...blocks.map((block) => block.dataCodewords.length))
  const finalCodewords = []

  for (let localIndex = 0; localIndex < maxDataSize; localIndex++) {
    blocks.forEach((block) => {
      const codeword = block.dataCodewords[localIndex]
      if (!codeword) return

      finalCodewords.push({
        index: finalCodewords.length,
        type: 'data',
        blockId: block.id,
        blockLabel: block.label,
        group: block.group,
        localIndex,
        value: codeword.value,
        bits: codeword.bits,
        bitMeta: codeword.bitMeta
      })
    })
  }

  for (let localIndex = 0; localIndex < ecCodewordsPerBlock; localIndex++) {
    blocks.forEach((block) => {
      const codeword = block.errorCodewords[localIndex]
      if (!codeword) return

      finalCodewords.push({
        index: finalCodewords.length,
        type: 'error-correction',
        blockId: block.id,
        blockLabel: block.label,
        group: block.group,
        localIndex,
        value: codeword.value,
        bits: codeword.bits,
        bitMeta: codeword.bitMeta
      })
    })
  }

  return {
    blocks,
    finalCodewords,
    totalCodewords,
    dataTotalCodewords,
    ecTotalCodewords,
    ecCodewordsPerBlock
  }
}

function getMaskAt(maskPattern, row, col) {
  switch (maskPattern) {
    case 0: return (row + col) % 2 === 0
    case 1: return row % 2 === 0
    case 2: return col % 3 === 0
    case 3: return (row + col) % 3 === 0
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0
    case 5: return (row * col) % 2 + (row * col) % 3 === 0
    case 6: return ((row * col) % 2 + (row * col) % 3) % 2 === 0
    case 7: return ((row * col) % 3 + (row + col) % 2) % 2 === 0
    default: return false
  }
}

function setupFormatInfo(matrix, errorCorrectionLevel, maskPattern) {
  const size = matrix.size
  const bits = FormatInfo.getEncodedBits(errorCorrectionLevel, maskPattern)

  for (let bit = 0; bit < 15; bit++) {
    const mod = ((bits >> bit) & 1) === 1

    if (bit < 6) {
      matrix.set(bit, 8, mod, true)
    } else if (bit < 8) {
      matrix.set(bit + 1, 8, mod, true)
    } else {
      matrix.set(size - 15 + bit, 8, mod, true)
    }

    if (bit < 8) {
      matrix.set(8, size - bit - 1, mod, true)
    } else if (bit < 9) {
      matrix.set(8, 15 - bit, mod, true)
    } else {
      matrix.set(8, 15 - bit - 1, mod, true)
    }
  }

  matrix.set(size - 8, 8, 1, true)
}

function buildMaskScoringMatrix(modules, size, errorCorrectionLevel, candidatePattern) {
  const matrix = new BitMatrix(size)

  modules.forEach((module) => {
    const value = module.rawValue != null ? Boolean(module.rawValue) : module.isDark
    matrix.set(module.row, module.col, value, module.reserved)
  })

  setupFormatInfo(matrix, errorCorrectionLevel, candidatePattern)

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (matrix.isReserved(row, col)) continue
      matrix.xor(row, col, getMaskAt(candidatePattern, row, col))
    }
  }

  return matrix
}

function scoreRun(length) {
  if (length < 5) return 0
  return 3 + (length - 5)
}

function buildPenaltyN1Details(matrix) {
  const runs = []
  let total = 0

  const captureRuns = (direction) => {
    for (let lineIndex = 0; lineIndex < matrix.size; lineIndex++) {
      let runStart = 0
      let runLength = 1
      let lastValue = direction === 'row'
        ? matrix.get(lineIndex, 0)
        : matrix.get(0, lineIndex)

      for (let offset = 1; offset < matrix.size; offset++) {
        const value = direction === 'row'
          ? matrix.get(lineIndex, offset)
          : matrix.get(offset, lineIndex)

        if (value === lastValue) {
          runLength += 1
          continue
        }

        const penalty = scoreRun(runLength)
        if (penalty) {
          runs.push({
            direction,
            lineIndex,
            start: runStart,
            end: runStart + runLength - 1,
            length: runLength,
            color: lastValue ? 'dark' : 'light',
            penalty
          })
          total += penalty
        }

        runStart = offset
        runLength = 1
        lastValue = value
      }

      const penalty = scoreRun(runLength)
      if (penalty) {
        runs.push({
          direction,
          lineIndex,
          start: runStart,
          end: runStart + runLength - 1,
          length: runLength,
          color: lastValue ? 'dark' : 'light',
          penalty
        })
        total += penalty
      }
    }
  }

  captureRuns('row')
  captureRuns('col')

  return {
    runs,
    total
  }
}

function buildPenaltyN2Details(matrix) {
  const blocks = []

  for (let row = 0; row < matrix.size - 1; row++) {
    for (let col = 0; col < matrix.size - 1; col++) {
      const value = matrix.get(row, col)
      const sum = value +
        matrix.get(row, col + 1) +
        matrix.get(row + 1, col) +
        matrix.get(row + 1, col + 1)

      if (sum === 4 || sum === 0) {
        blocks.push({
          row,
          col,
          color: value ? 'dark' : 'light',
          penalty: 3
        })
      }
    }
  }

  return {
    blocks,
    total: blocks.length * 3
  }
}

function buildPenaltyN3Details(matrix) {
  const patterns = []
  const darkFirst = 0x5D0
  const lightFirst = 0x05D

  for (let lineIndex = 0; lineIndex < matrix.size; lineIndex++) {
    let rowBits = 0
    let colBits = 0

    for (let offset = 0; offset < matrix.size; offset++) {
      rowBits = ((rowBits << 1) & 0x7FF) | matrix.get(lineIndex, offset)
      if (offset >= 10 && (rowBits === darkFirst || rowBits === lightFirst)) {
        patterns.push({
          direction: 'row',
          lineIndex,
          start: offset - 10,
          end: offset,
          bits: rowBits.toString(2).padStart(11, '0'),
          penalty: 40
        })
      }

      colBits = ((colBits << 1) & 0x7FF) | matrix.get(offset, lineIndex)
      if (offset >= 10 && (colBits === darkFirst || colBits === lightFirst)) {
        patterns.push({
          direction: 'col',
          lineIndex,
          start: offset - 10,
          end: offset,
          bits: colBits.toString(2).padStart(11, '0'),
          penalty: 40
        })
      }
    }
  }

  return {
    patterns,
    total: patterns.length * 40
  }
}

function buildPenaltyN4Details(matrix) {
  let darkCount = 0
  const totalModules = matrix.data.length

  for (let index = 0; index < totalModules; index++) {
    darkCount += matrix.data[index]
  }

  const darkPercent = darkCount * 100 / totalModules
  const bucket = Math.ceil(darkPercent / 5) * 5
  const deviationSteps = Math.abs(Math.ceil(darkPercent / 5) - 10)
  const score = deviationSteps * 10

  return {
    darkModules: darkCount,
    totalModules,
    darkPercent,
    bucket,
    deviationSteps,
    score
  }
}

function buildMaskingSummary(modules, size, errorCorrectionLevel, chosenPattern) {
  const candidates = Array.from({ length: 8 }, (_, pattern) => {
    const matrix = buildMaskScoringMatrix(modules, size, errorCorrectionLevel, pattern)
    const n1Details = buildPenaltyN1Details(matrix)
    const n1 = n1Details.total
    const n2Details = buildPenaltyN2Details(matrix)
    const n2 = n2Details.total
    const n3Details = buildPenaltyN3Details(matrix)
    const n3 = n3Details.total
    const n4Details = buildPenaltyN4Details(matrix)
    const n4 = n4Details.score
    const total = n1 + n2 + n3 + n4
    const detail = getMaskPatternDetails(pattern)

    return {
      pattern,
      ...detail,
      penalties: {
        n1,
        n2,
        n3,
        n4,
        total
      },
      details: {
        n1: n1Details,
        n2: n2Details,
        n3: n3Details,
        n4: n4Details
      },
      chosen: pattern === chosenPattern
    }
  })

  return {
    chosenPattern,
    chosenDetail: getMaskPatternDetails(chosenPattern),
    decisionRule: 'The QR encoder tests all 8 mask patterns, scores each one with penalty rules N1-N4, and picks the lowest total.',
    finalBitRule: 'For data-bearing cells, final bit = raw bit XOR mask bit.',
    candidates
  }
}

function buildReservedMap(version) {
  const size = Utils.getSymbolSize(version)
  const reserved = new Uint8Array(size * size)
  const categories = Array(size * size).fill(null)
  const setReserved = (row, col, category) => {
    if (row < 0 || col < 0 || row >= size || col >= size) return
    const index = row * size + col
    reserved[index] = 1
    categories[index] = category
  }

  FinderPattern.getPositions(version).forEach(([row, col]) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const category = r >= 0 && r <= 6 && c >= 0 && c <= 6 ? 'finder' : 'separator'
        setReserved(row + r, col + c, category)
      }
    }
  })

  for (let index = 8; index < size - 8; index++) {
    setReserved(index, 6, 'timing')
    setReserved(6, index, 'timing')
  }

  AlignmentPattern.getPositions(version).forEach(([row, col]) => {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        setReserved(row + r, col + c, 'alignment')
      }
    }
  })

  for (let bit = 0; bit < 15; bit++) {
    if (bit < 6) {
      setReserved(bit, 8, 'format')
    } else if (bit < 8) {
      setReserved(bit + 1, 8, 'format')
    } else {
      setReserved(size - 15 + bit, 8, 'format')
    }

    if (bit < 8) {
      setReserved(8, size - bit - 1, 'format')
    } else if (bit < 9) {
      setReserved(8, 15 - bit, 'format')
    } else {
      setReserved(8, 15 - bit - 1, 'format')
    }
  }

  if (version >= 7) {
    for (let bit = 0; bit < 18; bit++) {
      const row = Math.floor(bit / 3)
      const col = bit % 3 + size - 11
      setReserved(row, col, 'version')
      setReserved(col, row, 'version')
    }
  }

  setReserved(size - 8, 8, 'dark-module')

  return { size, reserved, categories }
}

function getFocusKeyFromSource(source) {
  if (!source) return null

  if (source.kind === 'segment') {
    if (source.field === 'mode') return 'mode'
    if (source.field === 'count') return 'count'
    return 'payload'
  }

  if (source.kind === 'terminator') return 'terminator'
  if (source.kind === 'byte-align') return 'byte-align'
  if (source.kind === 'pad') return 'pad'
  if (source.kind === 'error-correction') return 'error-correction'
  if (source.kind === 'remainder') return 'remainder'

  return null
}

function buildModuleMap(qr, blocksPayload) {
  const { version, maskPattern } = qr
  const { finalCodewords } = blocksPayload
  const { size, reserved, categories } = buildReservedMap(version)
  const flatData = Array.from(qr.modules.data)
  const modules = Array.from({ length: size * size }, (_, index) => {
    const row = Math.floor(index / size)
    const col = index % size

    return {
      key: `${row}-${col}`,
      row,
      col,
      reserved: Boolean(reserved[index]),
      category: categories[index],
      focusKey: categories[index],
      isDark: Boolean(flatData[index]),
      rawValue: null,
      maskBit: null,
      flippedByMask: false,
      source: null,
      codewordIndex: null,
      bitIndexInCodeword: null,
      blockId: null,
      blockLabel: null,
      codewordType: null,
      placementIndex: null
    }
  })

  let row = size - 1
  let inc = -1
  let streamBitIndex = 0
  let traversedCells = 0

  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1

    while (true) {
      for (let offset = 0; offset < 2; offset++) {
        const currentCol = col - offset
        const index = row * size + currentCol

        if (!reserved[index]) {
          const codewordIndex = Math.floor(streamBitIndex / 8)
          const bitIndexInCodeword = streamBitIndex % 8
          const codeword = finalCodewords[codewordIndex]
          const source = codeword
            ? codeword.bitMeta[bitIndexInCodeword]
            : {
                kind: 'remainder',
                value: 0
              }
          const rawValue = source.value
          const maskBit = getMaskAt(maskPattern, row, currentCol) ? 1 : 0
          traversedCells += 1

          modules[index] = {
            ...modules[index],
            reserved: false,
            category: codeword ? (codeword.type === 'data' ? 'data' : 'error-correction') : 'remainder',
            focusKey: getFocusKeyFromSource(source),
            rawValue,
            maskBit,
            flippedByMask: rawValue !== flatData[index],
            source,
            codewordIndex: codeword ? codeword.index : null,
            bitIndexInCodeword,
            blockId: codeword ? codeword.blockId : null,
            blockLabel: codeword ? codeword.blockLabel : null,
            codewordType: codeword ? codeword.type : null,
            isDark: Boolean(flatData[index]),
            placementIndex: traversedCells
          }

          streamBitIndex += 1
        }
      }

      row += inc

      if (row < 0 || row >= size) {
        row -= inc
        inc = -inc
        break
      }
    }
  }

  return {
    modules,
    traversedCells
  }
}

function enrichSegments(segments, modules) {
  const stats = new Map(
    segments.map((segment) => [
      segment.id,
      {
        moduleCount: 0,
        blockIds: new Set(),
        chunkHits: new Map()
      }
    ])
  )

  modules.forEach((module) => {
    if (!module.source || module.source.segmentId == null) return

    const target = stats.get(module.source.segmentId)
    target.moduleCount += 1
    if (module.blockId != null) target.blockIds.add(module.blockId)

    if (module.source.chunkIndex != null) {
      const current = target.chunkHits.get(module.source.chunkIndex) || 0
      target.chunkHits.set(module.source.chunkIndex, current + 1)
    }
  })

  return segments.map((segment) => {
    const extra = stats.get(segment.id)

    return {
      ...segment,
      moduleCount: extra.moduleCount,
      blockIds: Array.from(extra.blockIds),
      chunks: segment.chunks.map((chunk) => ({
        ...chunk,
        moduleCount: extra.chunkHits.get(chunk.index) || 0
      }))
    }
  })
}

function enrichBlocks(blocks, segments) {
  return blocks.map((block) => {
    const segmentIds = new Set()

    block.dataCodewords.forEach((codeword) => {
      codeword.bitMeta.forEach((bit) => {
        if (bit.segmentId != null) segmentIds.add(bit.segmentId)
      })
    })

    return {
      ...block,
      segmentIds: Array.from(segmentIds),
      segmentLabels: Array.from(segmentIds).map((segmentId) => {
        const segment = segments.find((entry) => entry.id === segmentId)
        return segment ? `S${segment.id + 1}` : null
      }).filter(Boolean)
    }
  })
}

function countBy(modules, key) {
  return modules.reduce((counts, module) => {
    const bucket = module[key]
    if (!bucket) return counts
    counts[bucket] = (counts[bucket] || 0) + 1
    return counts
  }, {})
}

export function analyzeQr(text, errorCorrectionLevel = 'M') {
  const qr = QRCode.create(text, {
    errorCorrectionLevel
  })

  const version = qr.version
  const initial = buildDataBuffer(qr.segments, version)
  const dataCapacityBits = (
    Utils.getSymbolTotalCodewords(version) -
    ECCode.getTotalCodewordsCount(version, qr.errorCorrectionLevel)
  ) * 8
  const padding = addPadding(initial.buffer, initial.sources, dataCapacityBits)
  const dataBytes = Array.from(new Uint8Array(initial.buffer.buffer))
  const blocksPayload = buildBlocks(dataBytes, initial.sources, version, qr.errorCorrectionLevel)
  const moduleMap = buildModuleMap(qr, blocksPayload)
  const modules = moduleMap.modules
  const segments = enrichSegments(initial.descriptors, modules)
  const blocks = enrichBlocks(blocksPayload.blocks, segments)
  const masking = buildMaskingSummary(modules, qr.modules.size, qr.errorCorrectionLevel, qr.maskPattern)
  const darkModules = qr.modules.data.reduce((count, value) => count + value, 0)

  return {
    text,
    version,
    size: qr.modules.size,
    maskPattern: qr.maskPattern,
    errorCorrectionLevel: errorCorrectionLevel.toUpperCase(),
    segments,
    blocks,
    modules,
    masking,
    placement: {
      totalTraversedCells: moduleMap.traversedCells,
      pathRule: 'Start at the bottom-right data area, move in two-column zig-zag stripes, skip reserved cells and timing column 6, then reverse direction at the top or bottom edge.'
    },
    finalCodewords: blocksPayload.finalCodewords,
    stats: {
      totalModules: qr.modules.size * qr.modules.size,
      darkModules,
      dataCapacityBits,
      segmentBits: initial.segmentBits,
      terminatorBits: padding.terminatorBits,
      alignmentBits: padding.alignmentBits,
      padBytes: padding.padBytes,
      dataCodewords: blocksPayload.dataTotalCodewords,
      errorCorrectionCodewords: blocksPayload.ecTotalCodewords,
      totalCodewords: blocksPayload.totalCodewords,
      blocks: blocks.length
    },
    counts: {
      category: countBy(modules, 'category'),
      focus: countBy(modules, 'focusKey')
    }
  }
}
