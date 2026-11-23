export type EducationLevel = '9 класс' | '10–11 класс' | 'Колледж (СПО)';

export type ProjectType =
  | 'Исследовательский'
  | 'Практико-ориентированный'
  | 'Информационный'
  | 'Творческий';

export type ChaptersCount = 2 | 3 | 4;

export interface ProjectInput {
  topic: string;
  subject: string;
  level: EducationLevel;
  projectType: ProjectType;
  chaptersCount: ChaptersCount;
  targetPages: number;
  institution: string;
  authorName: string;
  authorClass: string;
  supervisorName: string;
  city: string;
  year: string;
  source?: 'telegram' | 'simulator' | 'studio';
}

export interface ProjectSubsection {
  number: string;
  title: string;
  paragraphs: string[];
}

export interface GostTable {
  caption: string;
  headers: string[];
  rows: string[][];
}

export interface GostDiagramNode {
  step: string;
  title: string;
  detail: string;
}

export interface GostDiagram {
  caption: string;
  nodes: GostDiagramNode[];
}

export interface ProjectChapter {
  number: number;
  title: string;
  sections: ProjectSubsection[];
  tables: GostTable[];
  diagrams: GostDiagram[];
  summary: string;
}

export interface ProductPassport {
  productName: string;
  targetAudience: string;
  stages: string[];
  resources: string[];
  resultDescription: string;
}

export interface PresentationSlide {
  slideNumber: number;
  title: string;
  subtitle?: string;
  bullets: string[];
  layout: 'title' | 'bullets' | 'two_column' | 'table' | 'closing';
  tableData?: {
    headers: string[];
    rows: string[][];
  };
  speakerNote: string;
}

export interface DefenseSpeech {
  fullText: string;
  estimatedMinutes: number;
  qaPrep: {
    question: string;
    answer: string;
  }[];
}

export interface GeneratedProjectContent {
  introduction: {
    relevance: string[];
    problem: string;
    goal: string;
    tasks: string[];
    object: string;
    subjectMatter: string;
    hypothesis: string;
    methods: string[];
    practicalSignificance: string;
  };
  chapters: ProjectChapter[];
  productPassport: ProductPassport;
  conclusion: string[];
  bibliography: string[];
  defenseSpeech: DefenseSpeech;
  presentationSlides: PresentationSlide[];
}

export interface FullProject {
  id: string;
  createdAt: string;
  input: ProjectInput;
  content: GeneratedProjectContent;
  filename: string;
  pptxFilename: string;
  speechFilename: string;
  wordCount: number;
  estimatedPages: number;
}

export interface ProjectSummary {
  id: string;
  createdAt: string;
  topic: string;
  subject: string;
  level: EducationLevel;
  projectType: ProjectType;
  chaptersCount: ChaptersCount;
  targetPages: number;
  authorName: string;
  institution: string;
  filename: string;
  pptxFilename: string;
  speechFilename: string;
  wordCount: number;
  estimatedPages: number;
  source: 'telegram' | 'simulator' | 'studio';
}

export type TelegramButtonStyle = 'primary' | 'success' | 'danger';

export interface InlineButton {
  text: string;
  callbackData?: string;
  url?: string;
  style?: TelegramButtonStyle;
}

export interface BotAttachment {
  kind: 'project' | 'pptx' | 'speech';
  projectId: string;
  filename: string;
  label: string;
  downloadUrl: string;
}

export interface BotReplyMessage {
  text: string;
  parseMode?: 'HTML';
  inlineKeyboard?: InlineButton[][];
  document?: {
    projectId: string;
    filename: string;
    pptxFilename: string;
    speechFilename: string;
    wordCount: number;
    estimatedPages: number;
    chaptersCount: number;
    slidesCount: number;
  };
  attachments?: BotAttachment[];
}

export interface UserProfile {
  userId: string;
  username?: string;
  displayName: string;
  credits: number;
  generatedCount: number;
}

export interface ProgressUpdate {
  percent: number;
  stage: string;
}

export interface BotRuntimeStatus {
  telegramConfigured: boolean;
  telegramRunning: boolean;
  botUsername: string | null;
  botName: string | null;
  lastError: string | null;
  totalProjects: number;
  gostStandard: string;
  supportUsername: string;
}
