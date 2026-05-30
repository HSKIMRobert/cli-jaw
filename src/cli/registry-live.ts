import { fetchKiroModelInventory } from '../agent/kiro-models.js';
import { CLI_REGISTRY } from './registry.js';

export async function buildLiveCliRegistry() {
    const registry = structuredClone(CLI_REGISTRY) as Record<string, Record<string, unknown>>;
    const kiroInventory = await fetchKiroModelInventory();
    if (kiroInventory?.models.length) {
        registry['kiro-code'] = {
            ...registry['kiro-code'],
            models: kiroInventory.models,
            defaultModel: kiroInventory.defaultModel,
            modelSource: kiroInventory.source,
            modelDetails: kiroInventory.entries,
        };
    }
    return registry;
}
