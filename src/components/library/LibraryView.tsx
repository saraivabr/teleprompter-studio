import { useMemo, useState } from 'react'
import { deleteScript, listScripts } from '../../lib/storage'
import type { SavedScript } from '../../lib/types'
import { ScriptView } from '../script/ScriptView'
import './library.css'

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(timestamp),
  )
}

export function LibraryView() {
  const [version, setVersion] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const scripts = useMemo(() => listScripts(), [version])
  const selected: SavedScript | null = scripts.find((s) => s.id === selectedId) ?? scripts[0] ?? null

  const handleDelete = (id: string) => {
    deleteScript(id)
    if (selectedId === id) setSelectedId(null)
    setVersion((v) => v + 1)
  }

  if (scripts.length === 0) {
    return (
      <div className="library-empty">
        <p className="empty-glyph" aria-hidden="true">⌁</p>
        <p>Nenhum roteiro salvo ainda.</p>
        <p className="empty-hint">Gere um roteiro na aba Criar e salve aqui para reusar.</p>
      </div>
    )
  }

  return (
    <div className="library-view">
      <aside className="library-list" aria-label="Roteiros salvos">
        {scripts.map((script) => (
          <div
            key={script.id}
            className={`library-item${selected?.id === script.id ? ' is-active' : ''}`}
          >
            <button
              type="button"
              className="library-item-main"
              onClick={() => setSelectedId(script.id)}
            >
              <span className="library-item-title">
                {script.request.idea.slice(0, 64)}
                {script.request.idea.length > 64 ? '…' : ''}
              </span>
              <span className="library-item-meta">
                {script.request.platform} · {script.request.duration} · {formatDate(script.createdAt)}
              </span>
            </button>
            <button
              type="button"
              className="library-item-delete"
              onClick={() => handleDelete(script.id)}
              aria-label="Excluir roteiro"
              title="Excluir"
            >
              ✕
            </button>
          </div>
        ))}
      </aside>

      {selected && (
        <section className="library-detail" aria-label="Roteiro selecionado">
          <div className="library-detail-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void navigator.clipboard.writeText(selected.raw).catch(() => {})}
            >
              Copiar texto
            </button>
          </div>
          <ScriptView raw={selected.raw} />
        </section>
      )}
    </div>
  )
}
