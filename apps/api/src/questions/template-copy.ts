/**
 * Textos das perguntas de molde em cada idioma. O texto citado (versículo,
 * comentário, mishná) vem do Sefaria ou da tradução guardada; aqui ficam só as
 * frases fixas que envolvem a citação.
 */
import type { Locale } from '@trivia/shared';

export interface TemplateCopy {
  completeVerse: string;
  whichFirst: string;
  whichLast: string;
  orderIs: (refs: string) => string;
  nextVerse: string;
  nextExpl: (from: string, to: string, text: string) => string;
  parashaOf: string;
  parashaExpl: (ref: string, name: string, nameHe: string, range: string) => string;
  chapterOf: (book: string) => string;
  itIs: (ref: string) => string;
  commentVerse: (author: string) => string;
  someCommentator: string;
  sourceVerse: (book: string, parasha: string) => string;
  thisParasha: string;
  commentExpl: (author: string, verse: string, source: string) => string;
  sourceExpl: (label: string, verse: string) => string;
  commentAuthor: string;
  commentAuthorExpl: (author: string, verse: string, source: string) => string;
  whichTractate: string;
  whichBook: string;
  labelVerse: string;
  labelExcerpt: string;
  labelComment: string;
  labelCommentOn: (verse: string) => string;
  quote: (text: string) => string;
  arrow: string;
}

export const TEMPLATE_COPY: Readonly<Record<Locale, TemplateCopy>> = {
  pt: {
    completeVerse: 'Qual palavra completa o versículo?',
    whichFirst: 'Qual destes trechos aparece primeiro na parashá?',
    whichLast: 'Qual destes trechos aparece por último na parashá?',
    orderIs: (refs) => `A ordem na Torá é: ${refs}.`,
    nextVerse: 'Qual versículo vem logo depois deste?',
    nextExpl: (from, to, text) => `Depois de ${from} vem ${to}: "${text}"`,
    parashaOf: 'Em qual parashá está este versículo?',
    parashaExpl: (ref, name, nameHe, range) => `${ref} está na parashá ${name} (${nameHe}), ${range}.`,
    chapterOf: (book) => `Em que capítulo de ${book} está este versículo?`,
    itIs: (ref) => `É ${ref}.`,
    commentVerse: (author) => `Este comentário de ${author} explica qual versículo?`,
    someCommentator: 'um comentarista',
    sourceVerse: (book, parasha) => `Este trecho de ${book} cita ou explica qual versículo de ${parasha}?`,
    thisParasha: 'desta parashá',
    commentExpl: (author, verse, source) => `${author} comenta ${verse}. Fonte: ${source}.`,
    sourceExpl: (label, verse) => `${label} se liga a ${verse} (conexão registrada no Sefaria).`,
    commentAuthor: 'Quem escreveu este comentário?',
    commentAuthorExpl: (author, verse, source) => `É ${author}, comentando ${verse}. Fonte: ${source}.`,
    whichTractate: 'De qual tratado é este trecho?',
    whichBook: 'De qual livro é este trecho?',
    labelVerse: 'Versículo',
    labelExcerpt: 'Trecho',
    labelComment: 'Comentário',
    labelCommentOn: (verse) => `Comentário sobre ${verse}`,
    quote: (text) => `"${text}"`,
    arrow: ' → ',
  },
  en: {
    completeVerse: 'Which word completes the verse?',
    whichFirst: 'Which of these passages comes first in the parashah?',
    whichLast: 'Which of these passages comes last in the parashah?',
    orderIs: (refs) => `The order in the Torah is: ${refs}.`,
    nextVerse: 'Which verse comes right after this one?',
    nextExpl: (from, to, text) => `After ${from} comes ${to}: "${text}"`,
    parashaOf: 'Which parashah is this verse in?',
    parashaExpl: (ref, name, nameHe, range) => `${ref} is in parashat ${name} (${nameHe}), ${range}.`,
    chapterOf: (book) => `Which chapter of ${book} is this verse in?`,
    itIs: (ref) => `It is ${ref}.`,
    commentVerse: (author) => `Which verse does this comment by ${author} explain?`,
    someCommentator: 'a commentator',
    sourceVerse: (book, parasha) => `Which verse of ${parasha} does this passage from ${book} quote or explain?`,
    thisParasha: 'this parashah',
    commentExpl: (author, verse, source) => `${author} comments on ${verse}. Source: ${source}.`,
    sourceExpl: (label, verse) => `${label} is linked to ${verse} (a connection recorded in Sefaria).`,
    commentAuthor: 'Who wrote this comment?',
    commentAuthorExpl: (author, verse, source) => `It is ${author}, commenting on ${verse}. Source: ${source}.`,
    whichTractate: 'Which tractate is this passage from?',
    whichBook: 'Which book is this passage from?',
    labelVerse: 'Verse',
    labelExcerpt: 'Passage',
    labelComment: 'Comment',
    labelCommentOn: (verse) => `Comment on ${verse}`,
    quote: (text) => `"${text}"`,
    arrow: ' → ',
  },
  he: {
    completeVerse: 'איזו מילה משלימה את הפסוק?',
    whichFirst: 'איזה מהקטעים האלה מופיע ראשון בפרשה?',
    whichLast: 'איזה מהקטעים האלה מופיע אחרון בפרשה?',
    orderIs: (refs) => `הסדר בתורה: ${refs}.`,
    nextVerse: 'איזה פסוק בא מיד אחרי הפסוק הזה?',
    nextExpl: (from, to, text) => `אחרי ${from} בא ${to}: ״${text}״`,
    parashaOf: 'באיזו פרשה נמצא הפסוק הזה?',
    parashaExpl: (ref, name, _nameHe, range) => `${ref} נמצא בפרשת ${name}, ${range}.`,
    chapterOf: (book) => `באיזה פרק בספר ${book} נמצא הפסוק הזה?`,
    itIs: (ref) => `זה ${ref}.`,
    commentVerse: (author) => `איזה פסוק מפרש ${author} כאן?`,
    someCommentator: 'מפרש',
    sourceVerse: (book, parasha) => `איזה פסוק מפרשת ${parasha} מביא או דורש הקטע הזה מ${book}?`,
    thisParasha: 'הפרשה',
    commentExpl: (author, verse, source) => `${author} מפרש את ${verse}. מקור: ${source}.`,
    sourceExpl: (label, verse) => `${label} קשור ל${verse} (קישור שנרשם בספריא).`,
    commentAuthor: 'מי כתב את הפירוש הזה?',
    commentAuthorExpl: (author, verse, source) => `זה ${author}, על ${verse}. מקור: ${source}.`,
    whichTractate: 'מאיזו מסכת הקטע הזה?',
    whichBook: 'מאיזה ספר הקטע הזה?',
    labelVerse: 'פסוק',
    labelExcerpt: 'קטע',
    labelComment: 'פירוש',
    labelCommentOn: (verse) => `פירוש על ${verse}`,
    quote: (text) => `״${text}״`,
    arrow: ' ← ',
  },
};
