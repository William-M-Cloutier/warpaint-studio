import { useCallback, useEffect, useRef, useState } from 'react'
import { CanvasStage, type StageHandle } from './components/CanvasStage'
import { CatalogBrowser } from './components/CatalogBrowser'
import { ColorPanel } from './components/ColorPanel'
import { Dialog } from './components/Dialog'
import { SectionPanel } from './components/SectionPanel'
import { TopBar } from './components/TopBar'
import { ToolStrip } from './components/ToolStrip'
import { useSchemes } from './hooks/useSchemes'
import { useTheme } from './hooks/useTheme'
import { backdropCssColor } from './lib/backdrop'
import { paintById, type PaintRangeId } from './lib/catalog'
import { createId, highlightColor, normalizeHex, rememberColor } from './lib/color'
import { DEFAULT_SNAP_STRENGTH } from './lib/edgeSnap'
import { decodeImage, isImageFile, photoTooLarge } from './lib/imageFile'
import { loadPrefs, savePrefs } from './lib/storage'
import type {
  BackdropChoice,
  ColorScheme,
  HighlightPigment,
  HistoryState,
  LoadedPhoto,
  MaskMode,
  PhotoState,
  SchemeColor,
  SectionCategory,
  SectionInfo,
  Tool,
} from './types'

// TODO(tutorial): an in-app tutorial comes near the end, after this workflow settles.

type DialogState =
  | { type: 'save' }
  | { type: 'delete'; scheme: ColorScheme }
  | { type: 'replace'; file: File }
  | null

type Notice = { id: number; text: string }

type SideTab = 'color' | 'sections' | 'catalog'

const SIDE_TABS: { id: SideTab; label: string }[] = [
  { id: 'color', label: 'Color' },
  { id: 'sections', label: 'Sections' },
  { id: 'catalog', label: 'Catalog' },
]

const EMPTY_HISTORY: HistoryState = { canUndo: false, canRedo: false, hasPaint: false }

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  if (!(target instanceof HTMLInputElement)) return false
  const type = target.type
  return (
    type === 'text' ||
    type === 'search' ||
    type === 'email' ||
    type === 'url' ||
    type === 'password' ||
    type === 'number' ||
    type === 'tel'
  )
}

function isFileDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

export function App() {
  const { theme, toggleTheme } = useTheme()
  const { schemes, saveScheme, deleteScheme } = useSchemes()
  const initialPrefs = useRef(loadPrefs())
  const [tool, setTool] = useState<Tool>('brush')
  const [color, setColor] = useState(initialPrefs.current.color)
  const [recent, setRecent] = useState(initialPrefs.current.recent)
  const [brushSize, setBrushSize] = useState(initialPrefs.current.brushSize)
  const [opacity, setOpacity] = useState(initialPrefs.current.opacity)
  const [palette, setPalette] = useState<SchemeColor[]>([])
  const [image, setImage] = useState<LoadedPhoto | null>(null)
  const [history, setHistory] = useState<HistoryState>(EMPTY_HISTORY)
  const [paintSerial, setPaintSerial] = useState(0)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [draftName, setDraftName] = useState('Untitled scheme')
  const [savePreview, setSavePreview] = useState<SchemeColor[]>([])
  const [notice, setNotice] = useState<Notice | null>(null)
  const [contentScale, setContentScale] = useState(1)
  const [cutoutActive, setCutoutActive] = useState(false)
  const [cutoutStrength, setCutoutStrength] = useState(34)
  const [cutoutBusy, setCutoutBusy] = useState(false)
  const [sections, setSections] = useState<SectionInfo[]>([])
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [maskMode, setMaskMode] = useState<MaskMode>('new')
  const [tolerance, setTolerance] = useState(48)
  const [showEdges, setShowEdges] = useState(false)
  const [edgeSnap, setEdgeSnap] = useState(false)
  const [snapStrength, setSnapStrength] = useState(DEFAULT_SNAP_STRENGTH)
  const [ridgesActive, setRidgesActive] = useState(false)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [proposeBusy, setProposeBusy] = useState(false)
  const [sideTab, setSideTab] = useState<SideTab>('color')
  const [paintLook, setPaintLook] = useState(initialPrefs.current.paintLook)
  const [highlightPigment, setHighlightPigment] = useState<HighlightPigment>('lighter')
  const [highlightBusy, setHighlightBusy] = useState(false)
  const [suggestionSource, setSuggestionSource] = useState<'current' | 'section'>('current')
  const [sectionPigment, setSectionPigment] = useState<string | null>(null)
  const [backdrop, setBackdrop] = useState<BackdropChoice>(initialPrefs.current.backdrop)
  const [backdropColor, setBackdropColor] = useState(initialPrefs.current.backdropColor)
  const [backdropImage, setBackdropImage] = useState<string | null>(null)
  const [backdropImageName, setBackdropImageName] = useState<string | null>(null)

  const stageRef = useRef<StageHandle>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef(image)
  const dialogRef = useRef(dialog)
  const cutoutTimer = useRef(0)
  const backdropImageRef = useRef<string | null>(null)
  imageRef.current = image
  dialogRef.current = dialog
  backdropImageRef.current = backdropImage

  const flash = useCallback((text: string) => {
    setNotice({ id: Date.now(), text })
  }, [])

  useEffect(() => {
    savePrefs({ color, recent, brushSize, opacity, paintLook, backdrop, backdropColor })
  }, [color, recent, brushSize, opacity, paintLook, backdrop, backdropColor])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 2800)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    return () => {
      if (imageRef.current) URL.revokeObjectURL(imageRef.current.url)
      if (backdropImageRef.current) URL.revokeObjectURL(backdropImageRef.current)
      window.clearTimeout(cutoutTimer.current)
    }
  }, [])

  useEffect(() => {
    setSectionPigment(stageRef.current?.sampleActivePigment() ?? null)
  }, [paintSerial, activeSectionId, image])

  const onPhoto = useCallback((photo: PhotoState) => {
    setContentScale((current) => (current === photo.contentScale ? current : photo.contentScale))
    setCutoutActive((current) => (current === photo.cutoutActive ? current : photo.cutoutActive))
  }, [])

  const onSections = useCallback((list: SectionInfo[], activeId: string | null) => {
    setSections(list)
    setActiveSectionId(activeId)
  }, [])

  const onHistory = useCallback((next: HistoryState) => {
    setPaintSerial((current) => current + 1)
    setHistory((current) =>
      current.canUndo === next.canUndo &&
      current.canRedo === next.canRedo &&
      current.hasPaint === next.hasPaint
        ? current
        : next,
    )
  }, [])

  const remember = useCallback((hex: string) => {
    const next = normalizeHex(hex)
    if (!next) return
    setRecent((current) => rememberColor(current, next))
  }, [])

  const setBrushColor = useCallback((hex: string) => {
    setColor(hex)
    setPickedId((id) => {
      if (!id) return null
      const paint = paintById(id)
      return paint && paint.hex === hex ? id : null
    })
  }, [])

  const loadFile = useCallback(
    async (file: File) => {
      const url = URL.createObjectURL(file)
      try {
        const element = await decodeImage(url)
        const width = element.naturalWidth
        const height = element.naturalHeight
        if (width < 1 || height < 1) throw new Error('empty')
        if (photoTooLarge(width, height)) {
          URL.revokeObjectURL(url)
          flash('That photo is too large to paint on. Try one under 24 megapixels.')
          return
        }
        const next = { url, name: file.name, width, height, element }
        const previousUrl = imageRef.current?.url
        if (previousUrl) URL.revokeObjectURL(previousUrl)
        window.clearTimeout(cutoutTimer.current)
        setCutoutActive(false)
        setImage(next)
        setHistory(EMPTY_HISTORY)
        flash(`Loaded ${file.name}`)
      } catch {
        URL.revokeObjectURL(url)
        flash('Could not read that image. Use a PNG, JPEG, WebP, or GIF.')
      }
    },
    [flash],
  )

  const requestLoad = useCallback(
    (file: File) => {
      if (!isImageFile(file)) {
        flash('Choose a PNG, JPEG, WebP, or GIF photo.')
        return
      }
      if (history.hasPaint || sections.length > 0) {
        setDialog({ type: 'replace', file })
        return
      }
      void loadFile(file)
    },
    [flash, history.hasPaint, loadFile, sections.length],
  )

  const requestLoadRef = useRef(requestLoad)
  requestLoadRef.current = requestLoad

  useEffect(() => {
    let depth = 0
    const onDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      depth += 1
      setDragging(true)
    }
    const onDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      depth = 0
      setDragging(false)
      const files = event.dataTransfer?.files
      const file = files?.[0]
      if (!file) return
      if ((files?.length ?? 0) > 1) flash('Using the first photo only.')
      requestLoadRef.current(file)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [flash])

  useEffect(() => {
    const releaseSpace = () => {
      stageRef.current?.setSpace(false)
      setSpaceHeld(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      if (dialogRef.current) return
      if (event.code === 'Space') {
        event.preventDefault()
        if (event.repeat) return
        stageRef.current?.setSpace(true)
        setSpaceHeld(true)
        return
      }
      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (mod && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) stageRef.current?.redo()
        else stageRef.current?.undo()
        return
      }
      if (mod && key === 'y') {
        event.preventDefault()
        stageRef.current?.redo()
        return
      }
      if (mod || event.altKey) return
      const bracket =
        event.code === 'BracketLeft' || event.key === '[' || event.key === '{'
          ? -1
          : event.code === 'BracketRight' || event.key === ']' || event.key === '}'
            ? 1
            : 0
      if (bracket !== 0) {
        event.preventDefault()
        const step = event.shiftKey ? 10 : 2
        setBrushSize((size) => clampSize(size + bracket * step))
        return
      }
      if (event.code === 'Digit0') {
        event.preventDefault()
        if (event.shiftKey) stageRef.current?.autoScale()
        else stageRef.current?.fit()
        return
      }
      if (key === 'b' || key === '1') setTool('brush')
      else if (key === 'e' || key === '2') setTool('eraser')
      else if (key === 'i' || key === '3') setTool('eyedropper')
      else if (key === 'h' || key === '4') setTool('pan')
      else if (key === 'f') stageRef.current?.fillSection()
      else if (key === 'r') setTool('restore')
      else if (key === 'x') setTool('eraseBackdrop')
      else if (key === 'w') {
        setTool('wand')
        setSideTab('sections')
      } else if (key === 'l') {
        setTool('lasso')
        setSideTab('sections')
      } else if (key === 'm') {
        setTool('maskBrush')
        setSideTab('sections')
      }
      else if (key === 's') setEdgeSnap((enabled) => !enabled)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') releaseSpace()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', releaseSpace)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseSpace)
    }
  }, [])

  const colorsForSave = (): SchemeColor[] => {
    if (palette.length > 0) return palette.map((entry) => ({ ...entry }))
    const seen = new Set<string>()
    const colors: SchemeColor[] = []
    for (const hex of [color, ...recent]) {
      if (seen.has(hex)) continue
      seen.add(hex)
      colors.push({ id: createId(), hex, label: '' })
      if (colors.length >= 12) break
    }
    return colors
  }

  const openSave = () => {
    setSavePreview(colorsForSave())
    setDraftName('Untitled scheme')
    setDialog({ type: 'save' })
  }

  const confirmSave = () => {
    const name = draftName.trim()
    if (!name || savePreview.length === 0) return
    if (palette.length === 0) setPalette(savePreview)
    saveScheme(name, savePreview)
    setDialog(null)
    flash(`Saved “${name}”`)
  }

  const loadScheme = (scheme: ColorScheme) => {
    setPalette(scheme.colors.map((entry) => ({ ...entry, id: createId() })))
    if (scheme.colors[0]) {
      setColor(scheme.colors[0].hex)
      setPickedId(null)
    }
    flash(`Loaded “${scheme.name}”`)
  }

  const closeDialog = useCallback(() => setDialog(null), [])

  const runCutout = (strength: number, announce: boolean) => {
    setCutoutBusy(true)
    window.setTimeout(() => {
      const result = stageRef.current?.applyCutout(strength) ?? null
      setCutoutBusy(false)
      if (!announce || !result) return
      if (result.removedRatio < 0.01) {
        flash('The edges already match the miniature. Raise cutout strength to remove more.')
      } else if (result.removedRatio > 0.92) {
        flash('That strength removed most of the photo. Lower it, or reset the cutout.')
      } else {
        flash('Backdrop removed. Reset cutout restores the photo.')
      }
    }, 30)
  }

  const onCutoutStrength = (value: number) => {
    setCutoutStrength(value)
    if (!cutoutActive) return
    window.clearTimeout(cutoutTimer.current)
    cutoutTimer.current = window.setTimeout(() => {
      stageRef.current?.applyCutout(value)
    }, 80)
  }
  const replaceName = schemes.find((scheme) => scheme.name.toLowerCase() === draftName.trim().toLowerCase())
  const activeSection = sections.find((section) => section.id === activeSectionId) ?? null
  const sectionChip = activeSection
    ? { name: activeSection.name.trim() || 'Untitled section', color: activeSection.color }
    : null

  const proposeSections = () => {
    if (!image || proposeBusy) return
    setProposeBusy(true)
    window.setTimeout(() => {
      const count = stageRef.current?.proposeSections() ?? 0
      setProposeBusy(false)
      if (count < 1) flash('No separate regions stood out. Trace one with the wand or lasso.')
      else flash(`Added ${count} sections. Paint stays inside the active one.`)
    }, 30)
  }

  const labelSection = (id: string, category: SectionCategory, customLabel: string) => {
    stageRef.current?.labelSection(id, category, customLabel)
  }

  const usingSectionPaint = suggestionSource === 'section' && sectionPigment !== null
  const suggestionHex = usingSectionPaint && sectionPigment ? sectionPigment : color
  const pickedPaint = pickedId ? paintById(pickedId) : null
  const preferRange: PaintRangeId | null =
    pickedPaint && pickedPaint.hex === suggestionHex ? pickedPaint.range : null
  const highlightSwatch = highlightPigment === 'lighter' ? highlightColor(color) : color

  const pickCatalogPaint = (paint: { id: string; hex: string }) => {
    setColor(paint.hex)
    setPickedId(paint.id)
    remember(paint.hex)
  }

  const runAutoHighlight = () => {
    if (!image || highlightBusy) return
    setHighlightBusy(true)
    window.setTimeout(() => {
      const result = stageRef.current?.autoHighlight(highlightPigment) ?? 'none'
      setHighlightBusy(false)
      if (result === 'empty') flash('No raised edges stood out there.')
      else if (result === 'ok') flash('Highlighted the raised edges.')
    }, 30)
  }

  const clearBackdropImage = () => {
    setBackdropImage((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    setBackdropImageName(null)
  }

  const loadBackdropImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      flash('Choose a PNG, JPEG, WebP, or GIF for the background.')
      return
    }
    const url = URL.createObjectURL(file)
    setBackdropImage((current) => {
      if (current) URL.revokeObjectURL(current)
      return url
    })
    setBackdropImageName(file.name)
  }

  return (
    <div className="app">
      <TopBar
        theme={theme}
        image={image}
        canClear={history.hasPaint}
        cutoutActive={cutoutActive}
        onUpload={() => fileRef.current?.click()}
        onSave={openSave}
        onClear={() => {
          stageRef.current?.clearPaint()
          flash('Paint cleared')
        }}
        onFit={() => stageRef.current?.fit()}
        onToggleTheme={toggleTheme}
      />
      <div className="workspace">
        <ToolStrip
          tool={tool}
          brushSize={brushSize}
          opacity={opacity}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onTool={setTool}
          onBrushSize={setBrushSize}
          onOpacity={setOpacity}
          onUndo={() => stageRef.current?.undo()}
          onRedo={() => stageRef.current?.redo()}
          hasImage={image !== null}
          contentScale={contentScale}
          cutoutStrength={cutoutStrength}
          cutoutActive={cutoutActive}
          cutoutBusy={cutoutBusy}
          onPhotoScale={(scale) => {
            setContentScale(scale)
            stageRef.current?.setContentScale(scale)
          }}
          onAutoScale={() => stageRef.current?.autoScale()}
          onFitView={() => stageRef.current?.fit()}
          onCutoutStrength={onCutoutStrength}
          onRemoveBackdrop={() => runCutout(cutoutStrength, true)}
          onRepairCutout={() => {
            setCutoutBusy(true)
            window.setTimeout(() => {
              stageRef.current?.repairCutout()
              setCutoutBusy(false)
              flash('Cutout repaired')
            }, 30)
          }}
          onResetCutout={() => {
            window.clearTimeout(cutoutTimer.current)
            stageRef.current?.resetCutout()
            flash('Cutout reset')
          }}
          edgeSnap={edgeSnap}
          snapStrength={snapStrength}
          onEdgeSnap={setEdgeSnap}
          onSnapStrength={setSnapStrength}
          showEdgeSnap={
            tool === 'brush' ||
            tool === 'eraser' ||
            tool === 'highlight' ||
            ((tool === 'lasso' || tool === 'maskBrush') && sideTab !== 'sections')
          }
          onFill={() => stageRef.current?.fillSection()}
          highlightPigment={highlightPigment}
          highlightSwatch={highlightSwatch}
          highlightBusy={highlightBusy}
          onHighlightPigment={setHighlightPigment}
          onAutoHighlight={runAutoHighlight}
          paintLook={paintLook}
          onPaintLook={setPaintLook}
          backdrop={backdrop}
          backdropColor={backdropColor}
          backdropImageName={backdropImageName}
          onBackdrop={(choice) => {
            setBackdrop(choice)
            clearBackdropImage()
          }}
          onBackdropColor={(hex) => {
            const next = normalizeHex(hex)
            if (!next) return
            setBackdrop('custom')
            setBackdropColor(next)
            clearBackdropImage()
          }}
          onBackdropFile={loadBackdropImage}
          onClearBackdropImage={clearBackdropImage}
        />
        <CanvasStage
          ref={stageRef}
          image={image}
          tool={tool}
          color={color}
          brushSize={brushSize}
          opacity={opacity}
          spaceHeld={spaceHeld}
          tolerance={tolerance}
          showEdges={showEdges}
          edgeSnap={edgeSnap}
          snapStrength={snapStrength}
          maskMode={maskMode}
          paintLook={paintLook}
          viewBackdrop={cutoutActive ? backdropCssColor(backdrop, backdropColor) : null}
          backdropImage={cutoutActive ? backdropImage : null}
          sectionChip={sectionChip}
          onPickColor={(hex, commit) => {
            setBrushColor(hex)
            if (commit) remember(hex)
          }}
          onStroke={remember}
          onHistory={onHistory}
          onPhoto={onPhoto}
          onSections={onSections}
          onError={flash}
          onBrowse={() => fileRef.current?.click()}
          onRidges={setRidgesActive}
        />
        <div className="side-stack">
        <div
          className="side-tabs"
          role="tablist"
          aria-label="Side panels"
          onKeyDown={(event) => {
            const index = SIDE_TABS.findIndex((entry) => entry.id === sideTab)
            if (index < 0) return
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
            event.preventDefault()
            const step = event.key === 'ArrowRight' ? 1 : -1
            const next = SIDE_TABS[(index + step + SIDE_TABS.length) % SIDE_TABS.length]
            setSideTab(next.id)
            document.getElementById(`side-tab-${next.id}`)?.focus()
          }}
        >
          {SIDE_TABS.map((entry) => (
            <button
              key={entry.id}
              id={`side-tab-${entry.id}`}
              type="button"
              className="side-tab"
              role="tab"
              aria-selected={sideTab === entry.id}
              aria-controls={`side-panel-${entry.id}`}
              tabIndex={sideTab === entry.id ? 0 : -1}
              onClick={() => setSideTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div
          className="side-tabpanel"
          role="tabpanel"
          id="side-panel-sections"
          aria-labelledby="side-tab-sections"
          hidden={sideTab !== 'sections'}
        >
        <SectionPanel
          hasImage={image !== null}
          tool={tool}
          sections={sections}
          activeId={activeSectionId}
          maskMode={maskMode}
          tolerance={tolerance}
          showEdges={showEdges}
          proposeBusy={proposeBusy}
          onTool={setTool}
          onMaskMode={setMaskMode}
          onTolerance={setTolerance}
          onShowEdges={(value) => {
            setShowEdges(value)
            if (!value && (tool === 'edgeAdd' || tool === 'edgeErase')) setTool('brush')
          }}
          onSelect={(id) => stageRef.current?.selectSection(id)}
          onRename={(id, name) => stageRef.current?.renameSection(id, name)}
          onCategory={labelSection}
          onVisible={(id, visible) => stageRef.current?.setSectionVisible(id, visible)}
          onLocked={(id, locked) => stageRef.current?.setSectionLocked(id, locked)}
          onDelete={(id) => stageRef.current?.deleteSection(id)}
          onPropose={proposeSections}
          hasRidges={ridgesActive}
          onRidgeTool={(next) => {
            setShowEdges(true)
            setSideTab('sections')
            setTool(next)
          }}
          onClearRidges={() => stageRef.current?.clearRidges()}
          edgeSnap={edgeSnap}
          snapStrength={snapStrength}
          onEdgeSnap={setEdgeSnap}
          onSnapStrength={setSnapStrength}
          brushSize={brushSize}
          onBrushSize={setBrushSize}
        />
        </div>
        <div
          className="side-tabpanel"
          role="tabpanel"
          id="side-panel-color"
          aria-labelledby="side-tab-color"
          hidden={sideTab !== 'color'}
        >
        <ColorPanel
          color={color}
          recent={recent}
          palette={palette}
          schemes={schemes}
          onColor={setBrushColor}
          onRemember={remember}
          onAdd={() => {
            const picked = pickedId ? paintById(pickedId) : null
            const label = picked && picked.hex === color ? picked.name.slice(0, 40) : ''
            setPalette((current) => {
              if (current.some((entry) => entry.hex === color)) return current
              return [...current, { id: createId(), hex: color, label }]
            })
          }}
          onLabel={(id, label) => {
            setPalette((current) =>
              current.map((entry) => (entry.id === id ? { ...entry, label: label.slice(0, 40) } : entry)),
            )
          }}
          onRemove={(id) => setPalette((current) => current.filter((entry) => entry.id !== id))}
          onSave={openSave}
          onLoad={loadScheme}
          onAskDelete={(scheme) => setDialog({ type: 'delete', scheme })}
          pickedPaint={pickedPaint}
          suggestionHex={suggestionHex}
          suggestionSource={suggestionSource}
          sectionPaintAvailable={sectionPigment !== null}
          preferRange={preferRange}
          onSuggestionSource={setSuggestionSource}
          onPickPaint={pickCatalogPaint}
        />
        </div>
        <div
          className="side-tabpanel"
          role="tabpanel"
          id="side-panel-catalog"
          aria-labelledby="side-tab-catalog"
          hidden={sideTab !== 'catalog'}
        >
          <aside className="panel catalog-panel" aria-label="Paint catalog">
            <CatalogBrowser
              pickedId={pickedId}
              onPick={pickCatalogPaint}
              suggestionHex={suggestionHex}
              suggestionSource={suggestionSource}
              sectionPaintAvailable={sectionPigment !== null}
              preferRange={preferRange}
              onSuggestionSource={setSuggestionSource}
            />
          </aside>
        </div>
        </div>
      </div>

      <input
        ref={fileRef}
        className="file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) requestLoad(file)
        }}
      />

      {dragging && (
        <div className="drop-overlay" role="status">
          <div>
            <strong>{image ? 'Drop to replace the photo' : 'Drop a photo to start'}</strong>
            <p>{image ? 'Paint on the current picture will be cleared.' : 'One image. Paint stays on its own layer.'}</p>
          </div>
        </div>
      )}

      {notice && (
        <div className="toast" role="status" key={notice.id}>
          {notice.text}
        </div>
      )}

      {dialog?.type === 'save' && (
        <Dialog
          title="Save scheme"
          onClose={closeDialog}
          focusRef={nameRef}
          footer={
            <>
              <button type="button" className="btn" onClick={closeDialog}>
                Cancel
              </button>
              <button type="submit" form="save-scheme" className="btn btn-primary" disabled={!draftName.trim()}>
                Save
              </button>
            </>
          }
        >
          <form
            id="save-scheme"
            onSubmit={(event) => {
              event.preventDefault()
              confirmSave()
            }}
          >
            <label className="field">
              <span>Name</span>
              <input
                ref={nameRef}
                value={draftName}
                maxLength={60}
                spellCheck={false}
                onChange={(event) => setDraftName(event.target.value)}
              />
            </label>
          </form>
          <p className="hint">
            {palette.length > 0
              ? 'Saves the palette below.'
              : 'The palette is empty, so this saves the current color and recent swatches.'}
          </p>
          {replaceName && <p className="warn">A scheme named “{replaceName.name}” will be replaced.</p>}
          <div className="swatches dialog-swatches">
            {savePreview.map((entry) => (
              <span
                key={entry.id}
                className="swatch swatch-static"
                style={{ background: entry.hex }}
                title={entry.label || entry.hex}
              />
            ))}
          </div>
        </Dialog>
      )}

      {dialog?.type === 'delete' && (
        <Dialog
          title="Delete scheme"
          onClose={closeDialog}
          footer={
            <>
              <button type="button" className="btn" onClick={closeDialog}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  deleteScheme(dialog.scheme.id)
                  setDialog(null)
                  flash(`Deleted “${dialog.scheme.name}”`)
                }}
              >
                Delete
              </button>
            </>
          }
        >
          <p>Delete “{dialog.scheme.name}”? This only removes it from this browser.</p>
        </Dialog>
      )}

      {dialog?.type === 'replace' && (
        <Dialog
          title="Replace photo"
          onClose={closeDialog}
          footer={
            <>
              <button type="button" className="btn" onClick={closeDialog}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const file = dialog.file
                  setDialog(null)
                  void loadFile(file)
                }}
              >
                Replace
              </button>
            </>
          }
        >
          <p>The paint and sections on this photo will be cleared. Saved color schemes stay.</p>
        </Dialog>
      )}
    </div>
  )
}

function clampSize(size: number): number {
  return Math.min(160, Math.max(1, size))
}
