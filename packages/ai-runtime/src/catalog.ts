import { z } from "zod";
import type { AiRuntimeCatalog } from "@hyperfocus/ai-core/runtime";

export const catalogQuerySchema = z.object({
  agentId: z.string().min(1).max(160).optional(),
  providerId: z.string().min(1).max(160).optional(),
  search: z.string().max(160).optional(),
  availableOnly: z.boolean().optional()
}).strict();
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

export function filterAiCatalog(catalog: AiRuntimeCatalog, input: CatalogQuery = {}): AiRuntimeCatalog {
  const query = catalogQuerySchema.parse(input);
  const search = query.search?.trim().toLowerCase();
  const agents = catalog.agents.filter(agent => (!query.agentId || agent.id === query.agentId) && (!query.availableOnly || agent.available));
  const providerIds = new Set(agents.flatMap(agent => agent.providerIds));
  const providers = catalog.providers.filter(provider => providerIds.has(provider.id) &&
    (!query.providerId || provider.id === query.providerId) && (!query.availableOnly || provider.authenticated));
  const selectedProviders = new Set(providers.map(provider => provider.id));
  const models = catalog.models.filter(model => selectedProviders.has(model.providerId) &&
    (!search || `${model.id} ${model.label}`.toLowerCase().includes(search)));
  const modelKeys = new Set(models.map(model => `${model.providerId}\0${model.id}`));
  return { ...catalog,
    agents: agents.map(agent => ({ ...agent, providerIds: agent.providerIds.filter(id => selectedProviders.has(id)) })),
    providers: providers.map(provider => ({ ...provider, modelIds: provider.modelIds.filter(id => modelKeys.has(`${provider.id}\0${id}`)) })),
    models };
}
