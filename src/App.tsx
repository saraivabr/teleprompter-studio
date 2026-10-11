import { useEffect, useState } from 'react'
import { IonApp, IonIcon, IonLabel, IonTab, IonTabBar, IonTabButton, IonTabs } from '@ionic/react'
import { bookmarks, bookmarksOutline, sparkles, sparklesOutline } from 'ionicons/icons'
import { CreateView } from './components/create/CreateView'
import { LibraryView } from './components/library/LibraryView'
import { PrompterView } from './components/prompter/PrompterView'
import { haptic, setupSystemBars } from './lib/device'
import './app.css'

type Tab = 'create' | 'library'

export default function App() {
  const [tab, setTab] = useState<Tab>('create')
  const [prompterScript, setPrompterScript] = useState<string | null>(null)
  // Recarrega a biblioteca quando o usuário volta para ela (ex.: salvou um roteiro novo).
  const [libraryVersion, setLibraryVersion] = useState(0)

  useEffect(setupSystemBars, [])

  const onTabChange = (next: Tab) => {
    haptic('light')
    setTab(next)
    if (next === 'library') setLibraryVersion((v) => v + 1)
  }

  return (
    <IonApp className="app-shell">
      <IonTabs onIonTabsDidChange={(e) => onTabChange(e.detail.tab as Tab)}>
        <IonTab tab="create">
          <div className="ion-page">
            <CreateView onOpenPrompter={setPrompterScript} />
          </div>
        </IonTab>
        <IonTab tab="library">
          <div className="ion-page">
            <LibraryView key={libraryVersion} onOpenPrompter={setPrompterScript} />
          </div>
        </IonTab>

        <IonTabBar slot="bottom">
          <IonTabButton tab="create">
            <IonIcon icon={tab === 'create' ? sparkles : sparklesOutline} />
            <IonLabel>Criar</IonLabel>
          </IonTabButton>
          <IonTabButton tab="library">
            <IonIcon icon={tab === 'library' ? bookmarks : bookmarksOutline} />
            <IonLabel>Biblioteca</IonLabel>
          </IonTabButton>
        </IonTabBar>
      </IonTabs>

      {prompterScript !== null && (
        <PrompterView raw={prompterScript} onClose={() => setPrompterScript(null)} />
      )}
    </IonApp>
  )
}
