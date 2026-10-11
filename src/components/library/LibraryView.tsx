import { useMemo, useState } from 'react'
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/react'
import { arrowBack, copyOutline, documentTextOutline, star, trash, videocam } from 'ionicons/icons'
import { haptic } from '../../lib/device'
import { SEED_SCRIPTS } from '../../lib/seed-scripts'
import { deleteScript, listScripts } from '../../lib/storage'
import type { SavedScript } from '../../lib/types'
import { ScriptView } from '../script/ScriptView'
import './library.css'

const TOAST_MS = 1800
const TITLE_MAX = 72

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(timestamp),
  )
}

function isSeed(script: SavedScript): boolean {
  return script.id.startsWith('seed-')
}

function titleOf(script: SavedScript): string {
  const idea = script.request.idea.trim()
  return idea.length > TITLE_MAX ? `${idea.slice(0, TITLE_MAX)}…` : idea
}

interface LibraryViewProps {
  onOpenPrompter: (raw: string) => void
}

export function LibraryView({ onOpenPrompter }: LibraryViewProps) {
  const [version, setVersion] = useState(0)
  const [selected, setSelected] = useState<SavedScript | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const saved = useMemo(() => listScripts(), [version])

  const handleDelete = (id: string) => {
    deleteScript(id)
    haptic('medium')
    setVersion((v) => v + 1)
    setToast('Roteiro excluído')
  }

  const copy = (raw: string) => {
    navigator.clipboard
      .writeText(raw)
      .then(() => setToast('Texto copiado'))
      .catch(() => setToast('Não foi possível copiar neste aparelho'))
  }

  const openPrompter = (raw: string) => {
    setSelected(null)
    onOpenPrompter(raw)
  }

  const renderItem = (script: SavedScript) => {
    const item = (
      <IonItem button detail onClick={() => setSelected(script)}>
        <IonIcon slot="start" icon={isSeed(script) ? star : documentTextOutline} color={isSeed(script) ? 'primary' : undefined} />
        <IonLabel className="ion-text-wrap">
          <h2 className="library-item-title">{titleOf(script)}</h2>
          <p>
            {isSeed(script) ? 'Pronto para gravar' : formatDate(script.createdAt)} · {script.request.platform} ·{' '}
            {script.request.duration}
          </p>
        </IonLabel>
      </IonItem>
    )
    if (isSeed(script)) return <div key={script.id}>{item}</div>
    return (
      <IonItemSliding key={script.id}>
        {item}
        <IonItemOptions side="end">
          <IonItemOption color="danger" expandable onClick={() => handleDelete(script.id)}>
            <IonIcon slot="icon-only" icon={trash} aria-label="Excluir roteiro" />
          </IonItemOption>
        </IonItemOptions>
      </IonItemSliding>
    )
  }

  return (
    <>
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle className="page-title">Biblioteca</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <div className="page-body">
          <IonListHeader>
            <IonLabel>Seus roteiros</IonLabel>
            {saved.length > 0 && <IonBadge color="medium">{saved.length}</IonBadge>}
          </IonListHeader>
          {saved.length > 0 ? (
            <>
              <IonList inset className="card-list">
                {saved.map(renderItem)}
              </IonList>
              <p className="library-hint">Arraste um roteiro para a esquerda para excluir.</p>
            </>
          ) : (
            <div className="library-empty">
              <p className="empty-glyph" aria-hidden="true">⌁</p>
              <p>Nenhum roteiro salvo ainda.</p>
              <p className="empty-hint">Gere um roteiro na aba Criar e salve aqui para reusar.</p>
            </div>
          )}

          <IonListHeader>
            <IonLabel>Prontos para gravar</IonLabel>
          </IonListHeader>
          <IonList inset className="card-list">
            {SEED_SCRIPTS.map(renderItem)}
          </IonList>
        </div>
      </IonContent>

      <IonModal isOpen={selected !== null} onDidDismiss={() => setSelected(null)}>
        {selected && (
          <>
            <IonHeader className="ion-no-border">
              <IonToolbar>
                <IonButtons slot="start">
                  <IonButton onClick={() => setSelected(null)} aria-label="Voltar">
                    <IonIcon slot="icon-only" icon={arrowBack} />
                  </IonButton>
                </IonButtons>
                <IonTitle className="page-title">Roteiro</IonTitle>
                <IonButtons slot="end">
                  <IonButton onClick={() => copy(selected.raw)} aria-label="Copiar texto">
                    <IonIcon slot="icon-only" icon={copyOutline} />
                  </IonButton>
                </IonButtons>
              </IonToolbar>
            </IonHeader>
            <IonContent className="ion-padding">
              <div className="page-body">
                <ScriptView raw={selected.raw} />
              </div>
            </IonContent>
            <IonFooter className="ion-no-border action-footer">
              <IonToolbar>
                <IonButton expand="block" onClick={() => openPrompter(selected.raw)}>
                  <IonIcon slot="start" icon={videocam} />
                  Gravar com teleprompter
                </IonButton>
              </IonToolbar>
            </IonFooter>
          </>
        )}
      </IonModal>

      <IonToast
        isOpen={toast !== null}
        message={toast ?? ''}
        duration={TOAST_MS}
        onDidDismiss={() => setToast(null)}
      />
    </>
  )
}
