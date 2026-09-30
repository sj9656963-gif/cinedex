import { useEffect } from 'react';
import { TabBar } from './components/TabBar';
import { ToastHost } from './components/ToastHost';
import { useRoute, type Route } from './lib/router';
import { CollectionScreen } from './screens/CollectionScreen';
import { MovieScreen } from './screens/MovieScreen';
import { ScanScreen } from './screens/ScanScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TiersScreen } from './screens/TiersScreen';

const TITLES: Record<Route['name'], string> = {
  collection: '도감',
  scan: '티켓 스캔',
  movie: '카드',
  tiers: '등급 안내',
  settings: '설정',
};

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'collection':
      return <CollectionScreen />;
    case 'scan':
      return <ScanScreen />;
    case 'movie':
      return <MovieScreen id={route.id} />;
    case 'tiers':
      return <TiersScreen />;
    case 'settings':
      return <SettingsScreen />;
  }
}

export default function App() {
  const route = useRoute();
  const key = route.name === 'movie' ? `movie:${route.id}` : route.name;

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${TITLES[route.name]} · 씨네덱스`;
  }, [key, route.name]);

  return (
    <div className="app">
      <main className="app__main">
        <Screen key={key} route={route} />
      </main>
      <TabBar route={route} />
      <ToastHost />
    </div>
  );
}
