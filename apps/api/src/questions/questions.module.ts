import { Module } from '@nestjs/common';
import { QuestionFactory } from './question-factory.service.js';

/** Fábrica de perguntas dinâmicas (moldes sobre os textos do Sefaria), usada pela jornada e pela roleta. */
@Module({ providers: [QuestionFactory], exports: [QuestionFactory] })
export class QuestionsModule {}
