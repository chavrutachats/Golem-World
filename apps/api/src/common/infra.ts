/**
 * Dependências de infraestrutura injetáveis: relógio, sorteio e banco.
 * Em testes, relógio e sorteio são trocados por versões controladas.
 */
import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@trivia/db';
import { randomInt } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';

export const PRISMA = Symbol('PRISMA');
export const CLOCK = Symbol('CLOCK');
export const RANDOM = Symbol('RANDOM');

export interface Clock {
  now(): Date;
}

export interface RandomSource {
  /** Inteiro uniforme em [0, maxExclusive). */
  int(maxExclusive: number): number;
}

export const systemClock: Clock = { now: () => new Date() };

/** Sorteio criptograficamente seguro: o jogador não consegue prever a roleta. */
export const cryptoRandom: RandomSource = { int: (max) => randomInt(max) };

@Injectable()
class PrismaLifecycle implements OnApplicationShutdown {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}
  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PRISMA,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createPrismaClient({ databaseUrl: config.databaseUrl }),
    },
    { provide: CLOCK, useValue: systemClock },
    { provide: RANDOM, useValue: cryptoRandom },
    PrismaLifecycle,
  ],
  exports: [PRISMA, CLOCK, RANDOM],
})
export class InfraModule {}
