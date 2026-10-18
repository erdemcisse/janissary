export const CLAN_NAME_MAX = 24;
export const CLAN_TAG_MIN = 3;
export const CLAN_TAG_MAX = 5;
export const CLAN_MEMBER_CAP = 50;
export const CLAN_TAG_PATTERN = /^[A-Za-z0-9]{3,5}$/;
export const CLAN_NAME_PATTERN = /^[A-Za-z0-9 _.-]{2,24}$/;

export interface ClanRole {
  readonly clanId: number;
  readonly name: string;
  readonly tag: string;
  readonly founderPlayerId: number;
  readonly memberCount: number;
  readonly role: "none" | "member" | "founder";
}

export function validClanName(name: string): boolean {
  return CLAN_NAME_PATTERN.test(name.trim());
}

export function validClanTag(tag: string): boolean {
  return CLAN_TAG_PATTERN.test(tag.toUpperCase());
}

export function normalizeClanTag(tag: string): string {
  return tag.trim().toUpperCase();
}

export function clanNameConflictReason(): string {
  return "A clan with that name or tag already exists";
}
