import { z } from 'zod';
import { CapabilitySchema } from '@authority/action/schema';
import { EffectSchema } from '@authority/kernel';
import { ZoneSchema } from '@authority/policy/schema';

export const ScenarioSchema = z.object({
  id: z.string().min(1),
  mandateText: z.string().min(1),
  actionDescription: z.string().min(1),
  capability: CapabilitySchema,
  zone: ZoneSchema,
  targetRuleId: z.string().nullable(),
  expectedEffect: EffectSchema.nullable(),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export const ScenarioFileSchema = z.array(ScenarioSchema);
