import { useState } from 'react'
import { CreateView } from './components/create/CreateView'
import { LibraryView } from './components/library/LibraryView'
import { PrompterView } from './components/prompter/PrompterView'
import './app.css'

type View = 'create' | 'library'

export default function App() {
  const [view, setView] = useState<View>('create')
  const [prompterScript, setPrompterScript] = useState<string | null>(null)

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-rec" aria-hidden="true" />
          <h1>
            Roteiro <em>Studio</em>
          </h1>
        </div>
        <nav aria-label="Navegação principal">
          <button
            type="button"
            className={`nav-tab${view === 'create' ? ' is-active' : ''}`}
            aria-current={view === 'create' ? 'page' : undefined}
            onClick={() => setView('create')}
          >
            Criar
          </button>
          <button
            type="button"
            className={`nav-tab${view === 'library' ? ' is-active' : ''}`}
            aria-current={view === 'library' ? 'page' : undefined}
            onClick={() => setView('library')}
          >
            Biblioteca
          </button>
        </nav>
      </header>

      <main className="app-main">
        {view === 'create' && <CreateView onOpenPrompter={setPrompterScript} />}
        {view === 'library' && <LibraryView onOpenPrompter={setPrompterScript} />}
      </main>

      {prompterScript !== null && (
        <PrompterView raw={prompterScript} onClose={() => setPrompterScript(null)} />
      )}
    </div>
  )
}
