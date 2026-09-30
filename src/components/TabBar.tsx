import { href, type Route } from '../lib/router';
import { IconCards, IconScan, IconSettings, IconStar } from './Icons';

const TABS = [
  { route: { name: 'collection' }, label: '도감', Icon: IconCards },
  { route: { name: 'scan' }, label: '스캔', Icon: IconScan },
  { route: { name: 'tiers' }, label: '등급', Icon: IconStar },
  { route: { name: 'settings' }, label: '설정', Icon: IconSettings },
] as const satisfies readonly { route: Route; label: string; Icon: unknown }[];

export function TabBar({ route }: { route: Route }) {
  const active = route.name === 'movie' ? 'collection' : route.name;
  return (
    <nav className="tabbar" aria-label="메뉴">
      {TABS.map(({ route: target, label, Icon }) => (
        <a
          key={target.name}
          href={href(target)}
          className={`tabbar__item${target.name === 'scan' ? ' tabbar__item--scan' : ''}`}
          aria-current={active === target.name ? 'page' : undefined}
        >
          <span className="tabbar__icon">
            <Icon />
          </span>
          <span className="tabbar__label">{label}</span>
        </a>
      ))}
    </nav>
  );
}
