import type { ImageSourcePropType } from 'react-native';

export type CategoryId = 'jee' | 'neet' | 'foundation' | 'all';

export type Category = {
  id: CategoryId;
  label: string;
  shortLabel: string;
  icon: 'activity' | 'heart' | 'layers' | 'grid';
  tone: 'coral' | 'teal' | 'gold' | 'lavender';
};

export type Course = {
  id: string;
  category: Exclude<CategoryId, 'all'>;
  title: string;
  subtitle: string;
  description: string;
  instructor: string;
  validity: string;
  duration: string;
  lessons: number;
  students: string;
  price: number;
  originalPrice: number;
  image: ImageSourcePropType;
  tone: Category['tone'];
};

export const CATEGORIES: Category[] = [
  { id: 'jee', label: 'JEE prep', shortLabel: 'JEE', icon: 'activity', tone: 'coral' },
  { id: 'neet', label: 'NEET prep', shortLabel: 'NEET', icon: 'heart', tone: 'teal' },
  { id: 'foundation', label: 'Foundation', shortLabel: 'Foundation', icon: 'layers', tone: 'gold' },
  { id: 'all', label: 'All courses', shortLabel: 'All', icon: 'grid', tone: 'lavender' },
];

export const COURSES: Course[] = [
  {
    id: 'jee-physics-accelerator',
    category: 'jee',
    title: 'Physics Accelerator',
    subtitle: 'Mechanics to modern physics',
    description:
      'Build the kind of intuition that makes hard questions feel familiar. Work through high-yield concepts, exam patterns, and timed practice with a mentor who has seen every common trap.',
    instructor: 'Arjun Mehta',
    validity: '12 months access',
    duration: '42 hours',
    lessons: 68,
    students: '2.4k students',
    price: 2499,
    originalPrice: 3999,
    image: require('@/assets/images/icon.png'),
    tone: 'coral',
  },
  {
    id: 'neet-biology-core',
    category: 'neet',
    title: 'Biology Core',
    subtitle: 'Master NCERT, chapter by chapter',
    description:
      'A focused biology track that turns NCERT into a reliable scoring advantage. Revise smarter with visual memory hooks, chapter tests, and weekly doubt-solving.',
    instructor: 'Dr. Kavya Iyer',
    validity: '12 months access',
    duration: '36 hours',
    lessons: 54,
    students: '3.1k students',
    price: 1999,
    originalPrice: 3499,
    image: require('@/assets/images/icon.png'),
    tone: 'teal',
  },
  {
    id: 'foundation-math-lab',
    category: 'foundation',
    title: 'Math Lab · Grade 9–10',
    subtitle: 'Make the basics unshakeable',
    description:
      'A confidence-first maths program for students who want strong fundamentals before the competition gets serious. Learn by solving, drawing, and explaining.',
    instructor: 'Rhea Kapoor',
    validity: '9 months access',
    duration: '28 hours',
    lessons: 44,
    students: '1.8k students',
    price: 1499,
    originalPrice: 2499,
    image: require('@/assets/images/icon.png'),
    tone: 'gold',
  },
  {
    id: 'jee-chemistry-reaction-room',
    category: 'jee',
    title: 'Reaction Room',
    subtitle: 'Organic chemistry without the fog',
    description:
      'Turn reaction mechanisms into patterns you can recall under pressure. Includes guided problem sets, exam-ready cheat sheets, and weekly mixed quizzes.',
    instructor: 'Sameer Shah',
    validity: '12 months access',
    duration: '31 hours',
    lessons: 46,
    students: '1.2k students',
    price: 1799,
    originalPrice: 2999,
    image: require('@/assets/images/icon.png'),
    tone: 'lavender',
  },
];

export const NOTES = [
  { id: 'n1', title: 'Kinematics · Formula sheet', meta: '8 pages · PDF', icon: 'file-text' as const },
  { id: 'n2', title: 'Newton’s laws · Solved examples', meta: '14 pages · PDF', icon: 'book-open' as const },
  { id: 'n3', title: 'Work, energy & power', meta: '11 pages · PDF', icon: 'bookmark' as const },
];

export const LIVE_CLASSES = [
  { id: 'l1', title: 'Ask me anything: Mechanics', date: 'Tue, 7:00 PM', mentor: 'Arjun Mehta', live: true },
  { id: 'l2', title: 'Problem solving sprint #04', date: 'Thu, 6:30 PM', mentor: 'Arjun Mehta', live: false },
];

export const RECORDINGS = [
  { id: 'r1', title: 'Vectors that actually make sense', meta: '48 min · Replay', progress: 72 },
  { id: 'r2', title: 'The 5 mistakes costing you marks', meta: '34 min · Replay', progress: 0 },
  { id: 'r3', title: 'Circular motion masterclass', meta: '56 min · Replay', progress: 0 },
];

export const QUIZ_QUESTIONS = [
  {
    id: 'q1',
    question: 'A body starts from rest and moves with constant acceleration. Which statement is true?',
    options: ['Velocity stays constant', 'Displacement is proportional to time', 'Velocity is proportional to time', 'Acceleration becomes zero'],
    answer: 2,
  },
  {
    id: 'q2',
    question: 'The slope of a velocity–time graph represents:',
    options: ['Distance', 'Acceleration', 'Momentum', 'Displacement'],
    answer: 1,
  },
  {
    id: 'q3',
    question: 'Which quantity is a vector?',
    options: ['Speed', 'Energy', 'Work', 'Velocity'],
    answer: 3,
  },
];

export function getCourse(id?: string) {
  return COURSES.find((course) => course.id === id) ?? COURSES[0];
}

export function formatPrice(value: number) {
  return `₹${value.toLocaleString('en-IN')}`;
}