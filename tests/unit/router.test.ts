import { describe, expect, it } from 'vitest';
import { href, parseHash, type Route } from '../../src/lib/router';

describe('router', () => {
  it.each<[string, Route]>([
    ['', { name: 'collection' }],
    ['#/', { name: 'collection' }],
    ['#/scan', { name: 'scan' }],
    ['#/tiers', { name: 'tiers' }],
    ['#/settings', { name: 'settings' }],
    ['#/movie/tmdb%3A693134', { name: 'movie', id: 'tmdb:693134' }],
    ['#/movie/local%3A%EC%98%81%ED%99%94', { name: 'movie', id: 'local:영화' }],
    ['#/movie/%E0%A4%A', { name: 'collection' }],
    ['#/unknown', { name: 'collection' }],
  ])('%s', (hash, route) => {
    expect(parseHash(hash)).toEqual(route);
  });

  it('href ↔ parseHash 왕복', () => {
    const routes: Route[] = [{ name: 'collection' }, { name: 'scan' }, { name: 'movie', id: 'local:나의/영화?' }];
    for (const route of routes) expect(parseHash(href(route))).toEqual(route);
  });
});
