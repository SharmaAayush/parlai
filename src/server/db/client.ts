import { DataSource } from 'typeorm';
import { createDataSource } from './data-source';

const g = globalThis as unknown as { __ds?: Promise<DataSource> };

export function getDataSource(): Promise<DataSource> {
  g.__ds ??= createDataSource().initialize();
  return g.__ds;
}