import { useEffect, useRef, useState } from 'react'
import {
  IonAccordion,
  IonAccordionGroup,
  IonBadge,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonToast,
  IonToolbar,
} from '@ionic/react'
import {
  bookmarkOutline,
  copyOutline,
  flameOutline,
  refreshOutline,
  sparkles,
  stop,
  videocam,
} from 'ionicons/icons'
import { useGenerateScript } from '../../hooks/useGenerateScript'
import { useTrends, type TrendTopic } from '../../hooks/useTrends'
import { haptic } from '../../lib/device'
import { saveScript } from '../../lib/storage'
import {
  CONTEXT_PRESETS,
  COVERS,
  DURATIONS,
  PLATFORMS,
  type ContextId,
  type Cover,
  type Duration,
  type Platform,
  type ScriptRequest,
} from '../../lib/types'
import { ScriptView } from '../script/ScriptView'
import './create.css'

const IDEA_MAX = 12_000
const MORAL_MAX = 2_000
const NOTES_MAX = 4_000
const TOAST_MS = 1800
const NO_CONTEXT = 'none'

const PHASE_ANNOUNCEMENT: Record<string, string> = {
  connecting: 'Conectando…',
  thinking: 'Estruturando o roteiro…',
  streaming: 'Escrevendo o roteiro…',
  done: 'Roteiro pronto.',
  error: 'Ocorreu um erro na geração.',
}

interface CreateViewProps {
  onOpenPrompter: (raw: string) => void
}

export function CreateView({ onOpenPrompter }: CreateViewProps) {
  const [idea, setIdea] = useState('')
  const [platform, setPlatform] = useState<Platform>('Reels')
  const [duration, setDuration] = useState<Duration>('30 a 60 segundos')
  const [moral, setMoral] = useState('')
  const [cover, setCover] = useState<Cover>('Automática')
  const [context, setContext] = useState<ContextId | null>(null)
  const [extraNotes, setExtraNotes] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const { phase, text, error, generate, cancel } = useGenerateScript()
  const { status: trendsStatus, trends, error: trendsError, load: loadTrends } = useTrends()
  const busy = phase === 'connecting' || phase === 'thinking' || phase === 'streaming'
  const contentRef = useRef<HTMLIonContentElement>(null)
  const resultRef = useRef<HTMLElement>(null)
  const advancedCount = [context, moral.trim(), cover !== 'Automática' ? cover : '', extraNotes.trim()].filter(
    Boolean,
  ).length

  // O resultado fica abaixo do formulário: rola até ele quando a geração começa.
  useEffect(() => {
    if (phase === 'connecting' && resultRef.current) {
      void contentRef.current?.scrollToPoint(0, resultRef.current.offsetTop - 8, 400)
    }
    if (phase === 'done') haptic('medium')
  }, [phase])

  const applyTrend = (trend: TrendTopic) => {
    const seed = trend.news[0] ? `${trend.title} — ${trend.news[0]}` : trend.title
    setIdea((prev) =>
      prev.trim() ? `${prev.trim()}\n\nGancho com tema em alta: ${seed}` : `Tema em alta: ${seed}`,
    )
    setCover('Tema do momento')
    haptic('light')
  }

  const currentRequest = (): ScriptRequest => ({
    idea,
    platform,
    duration,
    moral: moral.trim() || undefined,
    cover: cover === 'Automática' ? undefined : cover,
    context: context ?? undefined,
    extraNotes: extraNotes.trim() || undefined,
  })

  const handleGenerate = () => {
    if (!idea.trim() || busy) return
    haptic('light')
    void generate(currentRequest())
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setToast('Texto copiado')
    } catch {
      setToast('Não foi possível copiar neste aparelho')
    }
  }

  const handleSave = () => {
    saveScript({ request: currentRequest(), raw: text })
    haptic('light')
    setToast('Salvo na biblioteca')
  }

  const done = phase === 'done' && Boolean(text)

  return (
    <>
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <div className="brand" slot="start">
            <span className="brand-rec" aria-hidden="true" />
            <h1>
              Roteiro <em>Studio</em>
            </h1>
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent ref={contentRef}>
        <div className="page-body create-view">
          <IonList inset className="card-list">
            <IonItem lines="none">
              <IonTextarea
                label="Sobre o que é o vídeo?"
                labelPlacement="stacked"
                value={idea}
                maxlength={IDEA_MAX}
                autoGrow
                rows={4}
                onIonInput={(e) => setIdea(e.detail.value ?? '')}
                placeholder="Ideia, tema ou texto bruto. Ex.: IA que liga para o cliente dentro do WhatsApp…"
              />
            </IonItem>
          </IonList>

          <div className="section-head">
            <IonNote>Sem ideia? Puxe um assunto em alta no Google.</IonNote>
            <IonButton
              size="small"
              fill="outline"
              onClick={() => void loadTrends()}
              disabled={trendsStatus === 'loading'}
            >
              {trendsStatus === 'loading' ? (
                <IonSpinner name="dots" />
              ) : (
                <IonIcon slot="start" icon={trendsStatus === 'done' ? refreshOutline : flameOutline} />
              )}
              {trendsStatus === 'done' ? 'Atualizar' : 'Em alta'}
            </IonButton>
          </div>

          {trendsStatus === 'error' && (
            <IonNote color="danger" className="section-note" role="alert">
              {trendsError}
            </IonNote>
          )}

          {trendsStatus === 'done' && trends.length > 0 && (
            <div className="chip-scroll">
              {trends.map((trend, i) => (
                <IonChip key={`${trend.title}-${i}`} outline onClick={() => applyTrend(trend)}>
                  <IonLabel>{trend.title}</IonLabel>
                  {trend.traffic && <IonBadge color="primary">{trend.traffic}</IonBadge>}
                </IonChip>
              ))}
            </div>
          )}

          <IonListHeader>
            <IonLabel>Plataforma</IonLabel>
          </IonListHeader>
          <IonSegment
            scrollable
            value={platform}
            onIonChange={(e) => setPlatform(e.detail.value as Platform)}
            aria-label="Plataforma"
          >
            {PLATFORMS.map((p) => (
              <IonSegmentButton key={p} value={p}>
                <IonLabel>{p}</IonLabel>
              </IonSegmentButton>
            ))}
          </IonSegment>

          <IonListHeader>
            <IonLabel>Duração</IonLabel>
          </IonListHeader>
          <IonSegment
            scrollable
            value={duration}
            onIonChange={(e) => setDuration(e.detail.value as Duration)}
            aria-label="Duração"
          >
            {DURATIONS.map((d) => (
              <IonSegmentButton key={d} value={d}>
                <IonLabel>{d}</IonLabel>
              </IonSegmentButton>
            ))}
          </IonSegment>

          <IonAccordionGroup className="advanced">
            <IonAccordion value="advanced">
              <IonItem slot="header" lines="none">
                <IonLabel>
                  <h2>Ajustes avançados</h2>
                  <p>Contexto, capa, moral da história e observações</p>
                </IonLabel>
                {advancedCount > 0 && <IonBadge slot="end">{advancedCount}</IonBadge>}
              </IonItem>
              <IonList slot="content" className="card-list">
                <IonItem>
                  <IonSelect
                    label="Contexto pronto"
                    labelPlacement="stacked"
                    interface="action-sheet"
                    value={context ?? NO_CONTEXT}
                    onIonChange={(e) =>
                      setContext(e.detail.value === NO_CONTEXT ? null : (e.detail.value as ContextId))
                    }
                  >
                    <IonSelectOption value={NO_CONTEXT}>Nenhum</IonSelectOption>
                    {CONTEXT_PRESETS.map((preset) => (
                      <IonSelectOption key={preset.id} value={preset.id}>
                        {preset.label}
                      </IonSelectOption>
                    ))}
                  </IonSelect>
                </IonItem>
                <IonItem>
                  <IonSelect
                    label="Capa do tema"
                    labelPlacement="stacked"
                    interface="action-sheet"
                    value={cover}
                    onIonChange={(e) => setCover(e.detail.value as Cover)}
                  >
                    {COVERS.map((c) => (
                      <IonSelectOption key={c} value={c}>
                        {c}
                      </IonSelectOption>
                    ))}
                  </IonSelect>
                </IonItem>
                <IonItem>
                  <IonTextarea
                    label="Moral da história"
                    labelPlacement="stacked"
                    value={moral}
                    maxlength={MORAL_MAX}
                    autoGrow
                    rows={2}
                    onIonInput={(e) => setMoral(e.detail.value ?? '')}
                    placeholder="O que você quer vender, ensinar ou fazer o público acreditar…"
                  />
                </IonItem>
                <IonItem lines="none">
                  <IonTextarea
                    label="Observações"
                    labelPlacement="stacked"
                    value={extraNotes}
                    maxlength={NOTES_MAX}
                    autoGrow
                    rows={2}
                    onIonInput={(e) => setExtraNotes(e.detail.value ?? '')}
                    placeholder="Ex.: cite o nome do produto, evite jargão X, tom mais provocativo…"
                  />
                </IonItem>
              </IonList>
            </IonAccordion>
          </IonAccordionGroup>

          <section ref={resultRef} className="create-result" aria-label="Roteiro gerado">
            <p className="sr-only" role="status">
              {PHASE_ANNOUNCEMENT[phase] ?? ''}
            </p>

            {phase === 'idle' && (
              <div className="result-empty">
                <p className="empty-glyph" aria-hidden="true">𝄞</p>
                <p>O roteiro aparece aqui, pronto para gravar.</p>
                <p className="empty-hint">
                  Com pausas <span className="mark-pause pause-1">·</span>, tons{' '}
                  <span className="mark-tone tone-up">↑</span> e ênfases já marcadas.
                </p>
              </div>
            )}

            {(phase === 'connecting' || phase === 'thinking') && (
              <div className="result-empty">
                <IonSpinner name="crescent" color="primary" />
                <p>{phase === 'thinking' ? 'Estruturando o roteiro…' : 'Conectando…'}</p>
              </div>
            )}

            {text && <ScriptView raw={text} streaming={phase === 'streaming'} />}

            {error && (
              <p className="result-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      </IonContent>

      <IonFooter className="ion-no-border action-footer">
        <IonToolbar>
          {done ? (
            <div className="footer-row">
              <IonButton expand="block" className="footer-primary" onClick={() => onOpenPrompter(text)}>
                <IonIcon slot="start" icon={videocam} />
                Gravar com teleprompter
              </IonButton>
              <IonButtons>
                <IonButton onClick={() => void handleCopy()} aria-label="Copiar texto">
                  <IonIcon slot="icon-only" icon={copyOutline} />
                </IonButton>
                <IonButton onClick={handleSave} aria-label="Salvar na biblioteca">
                  <IonIcon slot="icon-only" icon={bookmarkOutline} />
                </IonButton>
              </IonButtons>
            </div>
          ) : busy ? (
            <IonButton expand="block" color="danger" fill="outline" onClick={cancel}>
              <IonIcon slot="start" icon={stop} />
              Parar geração
            </IonButton>
          ) : (
            <IonButton expand="block" onClick={handleGenerate} disabled={!idea.trim()}>
              <IonIcon slot="start" icon={sparkles} />
              Gerar roteiro
            </IonButton>
          )}
        </IonToolbar>
      </IonFooter>

      <IonToast
        isOpen={toast !== null}
        message={toast ?? ''}
        duration={TOAST_MS}
        position="bottom"
        onDidDismiss={() => setToast(null)}
      />
    </>
  )
}
