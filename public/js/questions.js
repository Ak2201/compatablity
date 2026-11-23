// Question bank: DRAFT for psychologist review. Not final.
//
// Sources: 30 items from "Compatibility Arun Copy.pdf" (areas: Communication,
// Lifestyle & Habits, Love & Affection, Values & Priorities, Social Energy,
// Conflict Style) + 10 open reflection prompts from the same PDF + extra items
// drafted for goals, money, attachment, decisions and non-negotiables.
//
// Item fields:
//   id         stable key stored in answers (never reuse or renumber)
//   dimension  key into DIMENSIONS
//   text       what the person sees
//   type       'likert'      1-5 agree scale
//              'scale'       1-5 scale with low/high endpoint labels
//              'choice'      pick one of `options`
//              'dealbreaker' Yes / No only (flagged for conversation, never auto-rejected)
//              'text'        open reflection, saved but not scored
//   options    for 'choice': [{ value, label }]
//   low/high   for 'scale': endpoint labels
//   source     'pdf' or 'draft' (for the reviewer)
//
// `rule` on each dimension is documentation for the reviewer; scoring is in psychology.js.

export const LIKERT = [
  { value: 1, label: 'Strongly disagree' },
  { value: 2, label: 'Disagree' },
  { value: 3, label: 'Neutral' },
  { value: 4, label: 'Agree' },
  { value: 5, label: 'Strongly agree' },
];

export const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

export const DIMENSIONS = {
  communication: { title: 'Communication',          area: 'Communication',         rule: 'complementary', blurb: 'How you talk, and how you like to be talked to.' },
  lifestyle:     { title: 'Lifestyle & habits',     area: 'Lifestyle & Habits',    rule: 'similarity',    blurb: 'The everyday rhythm of living together.' },
  affection:     { title: 'Love & affection',       area: 'Love & Affection',      rule: 'complementary', blurb: 'How you show love, and how you like to receive it.' },
  values:        { title: 'Values & priorities',    area: 'Values & Priorities',   rule: 'similarity',    blurb: 'The bigger picture: beliefs, family and what matters.' },
  social:        { title: 'Social energy',          area: 'Social Energy',         rule: 'complementary', blurb: 'How many people you want around, and how you recharge.' },
  conflict:      { title: 'Conflict style',         area: 'Conflict Style',        rule: 'conflict',      blurb: 'What happens when you disagree.' },
  attachment:    { title: 'Closeness & security',   area: 'Extra: closeness',      rule: 'attachment',    blurb: 'How you feel about closeness, distance and reassurance.' },
  money:         { title: 'Money',                  area: 'Extra: money',          rule: 'similarity',    blurb: 'How you think about spending, saving and sharing.' },
  goals:         { title: 'Life goals',             area: 'Extra: goals',          rule: 'similarity',    blurb: 'Where you want your life to go together.' },
  decisions:     { title: 'Decisions',              area: 'Extra: decisions',      rule: 'complementary', blurb: 'How you make choices together.' },
  dealbreakers:  { title: 'Non-negotiables',        area: 'Extra: non-negotiables', rule: 'dealbreaker',  blurb: 'Things you may not be able to compromise on.' },
  intimacy:      { title: 'Intimacy',               area: 'Intimacy',              rule: 'complementary', blurb: 'How you think about closeness, desire, consent and comfort. Answer honestly, and use Not applicable for anything you would rather skip.' },
  reflection:    { title: 'Reflection',             area: 'Answer these too',      rule: 'none',          blurb: 'Open questions. Shared only after the reveal.' },
};

// Shorthand builders keep the bank readable.
const choice = (id, dimension, text, options, source = 'pdf') => ({ id, dimension, type: 'choice', text, options, source });
const scale = (id, dimension, text, low, high, source = 'pdf') => ({ id, dimension, type: 'scale', text, low, high, source });
const likert = (id, dimension, text, source = 'draft') => ({ id, dimension, type: 'likert', text, source });
const dealbreaker = (id, dimension, text) => ({ id, dimension, type: 'dealbreaker', text, options: YES_NO, source: 'draft' });
const text = (id, prompt) => ({ id, dimension: 'reflection', type: 'text', text: prompt, source: 'pdf' });

export const QUESTIONS = [
  // ---- Communication (8) ----
  choice('comm.annoyance', 'communication', 'When something your partner did annoys you, when do you say so?', [
    { value: 'straight', label: 'Straight away' },
    { value: 'calmed', label: 'Once I’ve calmed down' },
    { value: 'repeat', label: 'Only if it happens again' },
    { value: 'let_go', label: 'I usually let it go' },
  ]),
  scale('comm.evening_talk', 'communication', 'How much do you like to talk about your day in the evening?', 'A quick summary is plenty', 'I want to hear and tell everything'),
  choice('comm.upset_first', 'communication', 'When your partner is upset, what do you do first?', [
    { value: 'ask', label: 'Ask what’s wrong' },
    { value: 'fix', label: 'Try to fix it' },
    { value: 'space', label: 'Give them space' },
    { value: 'cheer', label: 'Try to cheer them up' },
  ]),
  choice('comm.bad_news', 'communication', 'How would you rather hear bad news?', [
    { value: 'now', label: 'Straight away, even by message' },
    { value: 'in_person', label: 'In person, when there’s time to talk' },
    { value: 'easiest', label: 'Whenever it’s easiest for them' },
  ]),
  scale('comm.checkin', 'communication', 'How often do you like to check in about how the relationship is going?', 'Only if something’s wrong', 'Regularly, even when things are fine'),
  likert('comm.open', 'communication', 'I find it easy to say how I am really feeling.'),
  likert('comm.listen', 'communication', 'When my partner talks, I listen to understand before I respond.'),
  likert('comm.needs', 'communication', 'I ask directly for what I need instead of hoping my partner notices.'),
  likert('comm.no', 'communication', 'I can say no to a partner without feeling guilty.'),

  // ---- Lifestyle & habits (8) ----
  choice('life.rhythm', 'lifestyle', 'Are you a morning person or a night person?', [
    { value: 'morning', label: 'Morning' },
    { value: 'night', label: 'Night' },
    { value: 'between', label: 'Somewhere in between' },
    { value: 'depends', label: 'Depends on the week' },
  ]),
  scale('life.tidy', 'lifestyle', 'How tidy does your home need to be for you to relax?', 'I barely notice mess', 'Everything has its place'),
  choice('life.weekend', 'lifestyle', 'A free weekend is best spent:', [
    { value: 'full_plan', label: 'With plans from start to finish' },
    { value: 'one_plan', label: 'With one plan and the rest open' },
    { value: 'no_plan', label: 'With no plans at all' },
    { value: 'chores', label: 'Catching up on chores and errands' },
  ]),
  scale('life.treats', 'lifestyle', 'How do you feel about spending on small everyday treats, like coffee and takeout?', 'I’d rather save', 'That’s what money’s for'),
  choice('life.vacation', 'lifestyle', 'On vacation, you’d rather:', [
    { value: 'packed', label: 'Pack in as much as possible' },
    { value: 'wander', label: 'Have a rough plan and wander' },
    { value: 'relax', label: 'Stay in one place and relax' },
    { value: 'active', label: 'Do something active, like hiking' },
  ]),
  likert('life.routine', 'lifestyle', 'I prefer a predictable daily routine.'),
  likert('life.health', 'lifestyle', 'Exercise and healthy eating are a daily priority for me.'),
  likert('life.pets', 'lifestyle', 'I want pets in our home.'),
  likert('life.screens', 'lifestyle', 'How much time we spend on phones and screens together matters to me.'),

  // ---- Love & affection (9) ----
  choice('aff.show_care', 'affection', 'How do you most naturally show you care?', [
    { value: 'words', label: 'Saying it' },
    { value: 'acts', label: 'Doing things for them' },
    { value: 'time', label: 'Spending focused time together' },
    { value: 'touch', label: 'Physical affection' },
    { value: 'gifts', label: 'Little gifts and surprises' },
  ]),
  choice('aff.feel_cared', 'affection', 'What makes you feel most cared for?', [
    { value: 'words', label: 'Hearing it' },
    { value: 'acts', label: 'Them doing things for me' },
    { value: 'time', label: 'Focused time together' },
    { value: 'touch', label: 'Physical affection' },
    { value: 'gifts', label: 'Little gifts and surprises' },
  ]),
  scale('aff.touch_need', 'affection', 'How much physical affection do you need to feel close?', 'A little goes a long way', 'Lots, every day'),
  choice('aff.public', 'affection', 'How do you feel about affection in public?', [
    { value: 'love_it', label: 'Love it' },
    { value: 'hands', label: 'Holding hands is fine, nothing more' },
    { value: 'private', label: 'Prefer to keep it private' },
    { value: 'depends', label: 'Depends where we are' },
  ]),
  choice('aff.after_hard_day', 'affection', 'After a hard day, what do you want most from your partner?', [
    { value: 'listen', label: 'Someone to listen' },
    { value: 'practical', label: 'Practical help' },
    { value: 'fun', label: 'Distraction and fun' },
    { value: 'quiet', label: 'A bit of quiet first' },
  ]),
  likert('aff.words', 'affection', 'I need to hear affirmation out loud, not just assume it.'),
  likert('aff.time', 'affection', 'Distraction-free time together matters more to me than grand gestures.'),
  likert('aff.acts', 'affection', 'Small practical help from a partner makes me feel cared for.'),
  likert('aff.gifts', 'affection', 'Thoughtful gifts make me feel remembered.'),
  likert('aff.expressive', 'affection', 'I show love openly and often.'),

  // ---- Values & priorities (9) ----
  choice('val.five_years', 'values', 'What matters most to you over the next five years?', [
    { value: 'security', label: 'Financial security' },
    { value: 'career', label: 'Career or creative goals' },
    { value: 'family', label: 'Family and relationships' },
    { value: 'freedom', label: 'Freedom to travel and try new things' },
  ]),
  choice('val.families', 'values', 'How involved do you want your families to be in your life together?', [
    { value: 'very', label: 'Very, with regular visits' },
    { value: 'close', label: 'Close, with clear boundaries' },
    { value: 'holidays', label: 'Mostly holidays and special occasions' },
    { value: 'own_thing', label: 'We mostly do our own thing' },
  ]),
  scale('val.shared_views', 'values', 'How important is it that you share the same views on big topics, like beliefs or politics?', 'Not important, differences are interesting', 'Very important'),
  likert('val.honesty', 'values', 'I would rather hear a hard truth than a comfortable lie.'),
  likert('val.loyalty', 'values', 'Loyalty to a partner matters more to me than personal freedom.'),
  likert('val.faith', 'values', 'Spiritual or religious practice is important in my life.'),
  likert('val.fairness', 'values', 'Fairness in a relationship should mean equal effort, not equal results.'),
  likert('val.tradition', 'values', 'Traditions and customs should be kept, even when they feel old-fashioned.'),
  likert('val.privacy', 'values', 'A partner should have some private space that the other does not see.'),

  // ---- Social energy (7) ----
  choice('soc.after_weekend', 'social', 'After a busy social weekend, you feel:', [
    { value: 'energised', label: 'Energised and ready for more' },
    { value: 'tired', label: 'Happy but tired' },
    { value: 'drained', label: 'Drained, I need a quiet day' },
    { value: 'depends', label: 'It depends who was there' },
  ]),
  scale('soc.alone_time', 'social', 'How much time alone do you need each week to feel like yourself?', 'Hardly any', 'A lot'),
  choice('soc.friends_couple', 'social', 'How often would you like to see friends as a couple?', [
    { value: 'weekends', label: 'Most weekends' },
    { value: 'fortnight', label: 'Every couple of weeks' },
    { value: 'monthly', label: 'Once a month or so' },
    { value: 'rare', label: 'Rarely, we’re happy just us' },
  ]),
  choice('soc.new_people', 'social', 'When you meet new people, you usually:', [
    { value: 'start', label: 'Start the conversation' },
    { value: 'wait', label: 'Wait for them to start' },
    { value: 'known', label: 'Stick with someone I know' },
    { value: 'listen', label: 'Prefer listening to talking' },
  ]),
  scale('soc.belonging', 'social', 'How long does it take you to feel at home with a new group of people?', 'Minutes', 'Months'),
  likert('soc.recharge_day', 'social', 'I need a regular day off from people, even from my partner.', 'draft'),
  likert('soc.friend_other_gender', 'social', 'I am comfortable with my partner having close friendships with people of other genders.'),

  // ---- Conflict style (13) ----
  choice('con.in_middle', 'conflict', 'In the middle of an argument, you tend to:', [
    { value: 'talk', label: 'Keep talking until it’s solved' },
    { value: 'break', label: 'Need a break before I can talk' },
    { value: 'quiet', label: 'Go quiet' },
    { value: 'loud', label: 'Get louder than I mean to' },
  ]),
  scale('con.recover', 'conflict', 'How long does it usually take you to feel normal again after an argument?', 'Minutes', 'A day or more'),
  choice('con.bed', 'conflict', 'Is it OK to go to bed on an argument?', [
    { value: 'yes', label: 'Yes, things look better in the morning' },
    { value: 'no', label: 'No, we should sort it out first' },
    { value: 'depends', label: 'Depends how big it is' },
  ]),
  scale('con.irritations', 'conflict', 'How do you feel about raising small irritations, like dishes or lateness?', 'Let them go', 'Mention them every time'),
  choice('con.after_helps', 'conflict', 'Once an argument is over, what helps most?', [
    { value: 'talk', label: 'Talking it through properly' },
    { value: 'closeness', label: 'A hug or some closeness' },
    { value: 'apart', label: 'Some time apart' },
    { value: 'normal', label: 'Doing something normal together, like a walk or a meal' },
  ]),
  likert('con.criticism', 'conflict', 'When upset, I tend to attack the person (“you always…”) rather than the problem.'),
  likert('con.contempt', 'conflict', 'When annoyed, I use sarcasm, eye-rolling or a mocking tone.'),
  likert('con.defensive', 'conflict', 'When criticised, my first reaction is to explain why I am not at fault.'),
  likert('con.stonewall', 'conflict', 'When a conversation gets heated, I tend to shut down and go silent.'),
  likert('con.repair', 'conflict', 'After an argument, I usually try to repair things quickly with a gesture or apology.'),
  likert('con.timeout', 'conflict', 'Taking a break during a heated argument, then returning to it, works well for me.'),
  likert('con.history', 'conflict', 'I sometimes bring up old issues in a new argument.'),
  likert('con.gentle', 'conflict', 'I can start a difficult conversation gently, without blame.'),
  likert('con.space', 'conflict', 'After a conflict I need some space before I can reconnect.'),

  // ---- Closeness & security (8) ----
  likert('att.comfort', 'attachment', 'I feel comfortable being emotionally close to a partner.'),
  likert('att.worry', 'attachment', 'I sometimes worry that a partner will leave me.'),
  likert('att.reassure', 'attachment', 'I need frequent reassurance that my partner is still committed.'),
  likert('att.depend', 'attachment', 'Depending on a partner for emotional support feels uncomfortable to me.'),
  likert('att.indep', 'attachment', 'I value being self-reliant, even inside a close relationship.'),
  likert('att.distance', 'attachment', 'When a partner gets very close, I sometimes feel the urge to pull back.'),
  likert('att.trust', 'attachment', 'I generally trust that a partner means well, even when I feel unsure.'),
  likert('att.jealous', 'attachment', 'I feel jealous fairly often in relationships.'),

  // ---- Money (6) ----
  scale('money.saving', 'money', 'How do you feel about saving money?', 'Spend it while you can enjoy it', 'Save as much as possible'),
  likert('money.spending', 'money', 'I am comfortable spending on experiences even when savings are low.'),
  choice('money.shared', 'money', 'In a committed relationship, I would prefer:', [
    { value: 'joint', label: 'One shared account for everything' },
    { value: 'mixed', label: 'A shared account plus some personal money' },
    { value: 'separate', label: 'Separate accounts with shared bills' },
    { value: 'unsure', label: 'I am not sure yet' },
  ]),
  likert('money.debt', 'money', 'I am uncomfortable being in debt, even when it is manageable.'),
  likert('money.big_purchase', 'money', 'Big purchases should be discussed with a partner before they happen.'),
  likert('money.generosity', 'money', 'I like to give generously to people I care about.'),
  likert('money.bills', 'money', 'We should talk about bills and debts in detail before moving in together.'),

  // ---- Life goals (6) ----
  likert('goals.children', 'goals', 'I want to have children at some point.'),
  choice('goals.children_when', 'goals', 'If I have children, I would like that to happen:', [
    { value: 'soon', label: 'Within the next few years' },
    { value: 'later', label: 'Later, once settled' },
    { value: 'unsure', label: 'I am not sure yet' },
    { value: 'no', label: 'I do not want children' },
  ]),
  likert('goals.location', 'goals', 'I am willing to move to another city or country for a partner I love.'),
  likert('goals.marriage', 'goals', 'Marriage or a formal commitment matters to me.'),
  likert('goals.home', 'goals', 'Owning a home is a goal I want to reach within five years.'),
  likert('goals.career', 'goals', 'My career goals are a big part of my sense of self.'),
  likert('goals.abroad', 'goals', 'I want to live abroad at least once in my life.'),

  // ---- Decisions (5) ----
  choice('dec.style', 'decisions', 'When we face a big decision together, like moving or changing jobs, you:', [
    { value: 'quick', label: 'Decide quickly and adjust later' },
    { value: 'research', label: 'Research everything first' },
    { value: 'talk', label: 'Talk it through for a long time' },
    { value: 'gut', label: 'Go with your gut' },
  ]),
  likert('dec.plan', 'decisions', 'I like to plan ahead rather than decide on the day.'),
  likert('dec.risk', 'decisions', 'I am comfortable taking a financial or life risk for a shared dream.'),
  likert('dec.final', 'decisions', 'When we cannot agree, one person should have the final say.'),
  likert('dec.split', 'decisions', 'Household decisions should be split by who is best at each area.'),

  // ---- Non-negotiables (5) — Yes / No only; flagged for conversation, never auto-rejected ----
  dealbreaker('deal.children', 'dealbreakers', 'Would it be a dealbreaker if a partner did not want children, or did and you did not?'),
  dealbreaker('deal.faith', 'dealbreakers', 'Would a major difference in faith or spiritual practice be a dealbreaker?'),
  dealbreaker('deal.relocate', 'dealbreakers', 'Would you refuse to relocate for a partner?'),
  dealbreaker('deal.substances', 'dealbreakers', 'Would smoking or heavy drinking by a partner be a dealbreaker?'),
  dealbreaker('deal.trust', 'dealbreakers', 'Would a breach of trust, such as secret contact with an ex, be a dealbreaker?'),

  // ---- Intimacy (16) — added later. Consent, desire and comfort, answered privately ----
  scale('intimacy.frequency', 'intimacy', 'How often do you feel like being physically intimate with a partner?', 'Rarely', 'Very often', 'draft'),
  choice('intimacy.initiate', 'intimacy', 'In a relationship, who usually starts physical intimacy?', [
    { value: 'me', label: 'Usually me' },
    { value: 'partner', label: 'Usually my partner' },
    { value: 'both', label: 'We both start it' },
    { value: 'depends', label: 'It depends on the moment' },
  ], 'draft'),
  likert('intimacy.talk', 'intimacy', 'I can talk openly with a partner about what I enjoy.', 'draft'),
  likert('intimacy.pace', 'intimacy', 'I like to try new things together, at a pace we both agree on.', 'draft'),
  likert('intimacy.consent', 'intimacy', 'A clear, enthusiastic yes matters to me more than going along to keep the peace.', 'draft'),
  likert('intimacy.limits', 'intimacy', 'I know my limits and can say so without feeling guilty.', 'draft'),
  scale('intimacy.stress', 'intimacy', 'How much does stress change your interest in intimacy?', 'Not at all', 'A great deal', 'draft'),
  likert('intimacy.closeness', 'intimacy', 'Physical closeness helps me feel emotionally close to a partner.', 'draft'),
  choice('intimacy.aftercare', 'intimacy', 'After being intimate, what helps you feel most connected?', [
    { value: 'talk', label: 'Talking together' },
    { value: 'cuddle', label: 'Cuddling or holding each other' },
    { value: 'quiet', label: 'Quiet time, side by side' },
    { value: 'space', label: 'Some space for a while' },
  ], 'draft'),
  choice('intimacy.protection', 'intimacy', 'How do you feel about contraception and protection?', [
    { value: 'agree', label: 'We agree on it together' },
    { value: 'discuss', label: 'I like to discuss it at the start' },
    { value: 'lead', label: 'I usually take the lead on it' },
    { value: 'unsure', label: 'I am not sure yet' },
  ], 'draft'),
  scale('intimacy.exclusivity', 'intimacy', 'How important is sexual exclusivity to you?', 'Not very', 'Essential', 'draft'),
  likert('intimacy.curious', 'intimacy', 'I ask my partner about their preferences, and I am curious about them.', 'draft'),
  choice('intimacy.health', 'intimacy', 'Would you talk about sexual health and testing before becoming intimate?', [
    { value: 'always', label: 'Yes, always' },
    { value: 'committed', label: 'Yes, once we are committed' },
    { value: 'asked', label: 'Only if one of us asks' },
    { value: 'notneeded', label: 'I do not think it is needed' },
  ], 'draft'),
  likert('intimacy.past', 'intimacy', 'I can talk about past experiences when it matters to a partner.', 'draft'),
  likert('intimacy.reassure', 'intimacy', 'I need reassurance that I am desired, not only that I am loved.', 'draft'),
  scale('intimacy.comfort', 'intimacy', 'How comfortable are you talking about sex with a partner?', 'Very uncomfortable', 'Completely at ease', 'draft'),

  // ---- Reflection (10) — open text, shared only after the reveal ----
  text('ref.great_week', 'What does a great week in your life look like right now?'),
  text('ref.decisions', 'How do you make decisions when something really matters to you?'),
  text('ref.non_negotiables', 'What are your non-negotiables in a relationship?'),
  text('ref.free_time', 'How do you like to spend your time when you’re not working?'),
  text('ref.stress_support', 'What does support look like to you when you’re stressed or overwhelmed?'),
  text('ref.fulfilled', 'What feels essential for you to feel happy and fulfilled long-term?'),
  text('ref.exhausting', 'What’s one thing that makes you feel mentally exhausted in a relationship?'),
  text('ref.red_flag', 'What’s your biggest emotional “red flag”?'),
  text('ref.triggers', 'What triggers you emotionally the fastest?'),
  text('ref.safe', 'What does “feeling safe” look like in a relationship for you?'),
];

// Sanity checks (run in dev/ tests later): unique ids, known dimensions, valid shapes.
export function validateQuestions(list = QUESTIONS) {
  const seen = new Set();
  const types = new Set(['likert', 'scale', 'choice', 'dealbreaker', 'text']);
  for (const q of list) {
    if (seen.has(q.id)) throw new Error(`duplicate question id: ${q.id}`);
    seen.add(q.id);
    if (!DIMENSIONS[q.dimension]) throw new Error(`unknown dimension for ${q.id}`);
    if (!types.has(q.type)) throw new Error(`unknown type for ${q.id}`);
    if (q.type === 'choice' && (!q.options || q.options.length < 2)) throw new Error(`choice needs options: ${q.id}`);
  }
  return list.length;
}
