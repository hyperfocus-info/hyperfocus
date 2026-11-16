import { z } from 'zod';

export const textAddressSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Use a full international phone number.');
export type IncomingText = { id: string; from: string; to: string; text: string; sentAt: string };
export type TextChannel = {
  available: boolean;
  sender: string;
  send(input: { to: string; text: string; expiresAt: string }): Promise<{ id: string }>;
  receive(request: Request): Promise<IncomingText>;
  delivery?(request: Request): Promise<{ id: string; status: 'accepted' | 'delivered' | 'failed'; recipient: string }>;
};
export const recipientBindingSchema = z.object({ address: textAddressSchema, verifiedAt: z.string().datetime(), channel: z.string().min(1), scopes: z.array(z.string().min(1)).min(1) }).strict();
/** One owner can cover many domain scopes; an incoming address must never select multiple owners. */
export function ownerForReply(bindings: readonly { owner: string; binding: z.infer<typeof recipientBindingSchema> }[], address: string, channel: string) {
  const owners = [...new Set(bindings.filter(row => row.binding.address === address && row.binding.channel === channel).map(row => row.owner))];
  if (owners.length !== 1) throw new Error('The reply has no unique verified owner. No action was approved.');
  return owners[0]!;
}
