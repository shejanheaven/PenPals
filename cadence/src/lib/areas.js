// Areas of life. Colours live in CSS (`--area-<id>`) so they adapt to the theme.
// `slot` is the area's position in the colour-blind-validated palette; charts
// order areas by slot so neighbouring colours stay distinguishable.
export const AREAS = [
  { id: 'work', slot: 1, label: 'Work', icon: 'Briefcase', aliases: ['job', 'career', 'craft'] },
  { id: 'health', slot: 3, label: 'Health', icon: 'HeartPulse', aliases: ['body', 'fitness', 'gym', 'exercise'] },
  { id: 'mind', slot: 7, label: 'Mind', icon: 'Flower2', aliases: ['spirit', 'mindful', 'meditation', 'soul'] },
  { id: 'people', slot: 8, label: 'People', icon: 'Users', aliases: ['family', 'friends', 'love', 'social'] },
  { id: 'growth', slot: 2, label: 'Growth', icon: 'BookOpen', aliases: ['learn', 'learning', 'study', 'school'] },
  { id: 'home', slot: 4, label: 'Home', icon: 'House', aliases: ['life', 'admin', 'chores', 'errands'] },
  { id: 'money', slot: 6, label: 'Money', icon: 'Wallet', aliases: ['finance', 'finances', 'budget'] },
  { id: 'joy', slot: 5, label: 'Joy', icon: 'Sun', aliases: ['fun', 'play', 'rest', 'hobby'] },
]

export const AREA_BY_ID = Object.fromEntries(AREAS.map((a) => [a.id, a]))

export const areaColor = (id) => (id && AREA_BY_ID[id] ? `var(--area-${id})` : 'var(--area-none)')
