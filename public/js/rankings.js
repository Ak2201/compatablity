// Pure pairing and ranking helpers for connections. No Supabase, no DOM, no fetch, no side effects.
// All scores come from computeReport (couple) and computeFriendshipReport (friendship). Nothing is scored here.
//
// Profile shape (per person): { couple: answers | null, friendship: answers | null }
//
// computePair(myProfile, partnerProfile, { myName, partnerName, myGender, partnerGender }) returns:
//   {
//     couple:      { applicable, score, band, report } (score and report null when not comparable),
//     friendship:  { score, band, report },
//     labelCouple, labelFriendship   (band label text, or null when there is no score)
//   }
// band is the report's overall.band object ({ key, label, blurb }), or null.
//
// Never throws on missing data.

import { computeReport } from './psychology.js';
import { computeFriendshipReport } from './friend-psychology.js';

const asObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const isScore = (n) => typeof n === 'number' && Number.isFinite(n);

// A gender counts as known only when it is a non-empty string. Compared case-insensitively.
function knownGender(g) {
  return typeof g === 'string' && g.trim() !== '' ? g.trim().toLowerCase() : null;
}

// The couple bank is only compared across genders: both known and different.
export function isCoupleApplicable(myGender, partnerGender) {
  const a = knownGender(myGender);
  const b = knownGender(partnerGender);
  return a !== null && b !== null && a !== b;
}

export function computePair(myProfile, partnerProfile, opts) {
  const o = asObj(opts) || {};
  const mine = asObj(myProfile) || {};
  const theirs = asObj(partnerProfile) || {};
  const myCouple = asObj(mine.couple);
  const theirCouple = asObj(theirs.couple);
  const myFriend = asObj(mine.friendship);
  const theirFriend = asObj(theirs.friendship);

  const applicable = isCoupleApplicable(o.myGender, o.partnerGender);
  let couple = { applicable, score: null, band: null, report: null };
  if (applicable && myCouple && theirCouple) {
    const report = computeReport(myCouple, theirCouple);
    couple = {
      applicable: true,
      score: report.overall.score,
      band: report.overall.band,
      report,
    };
  }

  let friendship = { score: null, band: null, report: null };
  if (myFriend && theirFriend) {
    const report = computeFriendshipReport(myFriend, theirFriend, {
      myName: o.myName,
      partnerName: o.partnerName,
    });
    friendship = { score: report.overall.score, band: report.overall.band, report };
  }

  return {
    couple,
    friendship,
    labelCouple: isScore(couple.score) ? couple.band.label : null,
    labelFriendship: isScore(friendship.score) ? friendship.band.label : null,
  };
}

// Highest score first. Ties go by partner name, then by id, so the order is always the same.
function byScoreThenName(x, y) {
  if (x.score !== y.score) return y.score - x.score;
  const nx = String(x.partnerName ?? '');
  const ny = String(y.partnerName ?? '');
  if (nx !== ny) return nx < ny ? -1 : 1;
  const ix = String(x.id ?? '');
  const iy = String(y.id ?? '');
  return ix < iy ? -1 : ix > iy ? 1 : 0;
}

function rankedItem(entry, result, kind) {
  return {
    id: entry.id,
    partnerName: entry.partnerName,
    partnerGender: entry.partnerGender ?? null,
    score: result.score,
    band: result.band,
    kind,
  };
}

function rankAll(items) {
  return items
    .sort(byScoreThenName)
    .map((item, i) => ({ ...item, rank: i + 1 }));
}

// entries: [{ id, partnerName, partnerGender, myGender, pair }] where pair is a computePair result.
// Couple: only applicable pairs with a score. Friendship: every pair with a score.
export function buildRankings(entries) {
  const list = Array.isArray(entries) ? entries.filter((e) => asObj(e)) : [];
  const couple = [];
  const friendship = [];
  for (const entry of list) {
    const pair = asObj(entry.pair) || {};
    const c = asObj(pair.couple);
    if (c && c.applicable === true && isScore(c.score)) couple.push(rankedItem(entry, c, 'couple'));
    const f = asObj(pair.friendship);
    if (f && isScore(f.score)) friendship.push(rankedItem(entry, f, 'friendship'));
  }
  return { couple: rankAll(couple), friendship: rankAll(friendship) };
}

// Connections that are not yet ready for ranking: not accepted, or either side has not shared.
// entries are connection rows with myShare, partnerShare and accepted.
export function pendingList(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter((e) => asObj(e) && (!e.myShare || !e.partnerShare || !e.accepted));
}
