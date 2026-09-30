import 'fake-indexeddb/auto';
import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import { beforeEach } from 'vitest';
import { closeDB } from '../../src/lib/db';

// 테스트마다 빈 IndexedDB 로 시작
beforeEach(async () => {
  await closeDB();
  globalThis.indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
});
