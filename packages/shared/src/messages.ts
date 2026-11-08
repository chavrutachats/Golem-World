/**
 * Mensagens que o servidor e as regras compartilhadas mostram ao jogador (erros de
 * regra de negócio, validação de nome e senha, limites de uso), em português, inglês
 * e hebraico, chaveadas pelo texto em português.
 *
 * O texto em português é um molde: `{nome}` vira o valor de `params.nome`. A API
 * escreve a mensagem no idioma do cabeçalho Accept-Language de cada pedido, e o app
 * usa as mesmas linhas quando valida um campo antes de enviar.
 *
 * Hebraico: verbos no plural ("בחרו", "נסו") e possessivos sem gênero ("שלך"), como
 * fazem os apps israelenses para falar com todo mundo ao mesmo tempo.
 */
import type { Locale } from './i18n.js';
import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN } from './limits.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password.js';

export type MessageParams = Readonly<Record<string, string | number>>;

const ROWS: readonly (readonly [pt: string, en: string, he: string])[] = [
  // Genéricas
  ['Dados inválidos.', 'Invalid data.', 'נתונים לא תקינים.'],
  ['Recurso não encontrado.', 'Not found.', 'לא נמצא.'],
  ['Acesso negado.', 'Access denied.', 'אין גישה.'],
  ['Faça login novamente.', 'Please sign in again.', 'יש להתחבר מחדש.'],
  ['Partida não encontrada.', 'Game not found.', 'המשחק לא נמצא.'],
  ['Pergunta não encontrada.', 'Question not found.', 'השאלה לא נמצאה.'],
  ['Fase não encontrada.', 'Level not found.', 'השלב לא נמצא.'],
  ['Fase desconhecida.', 'Unknown level.', 'שלב לא מוכר.'],
  ['Item não encontrado.', 'Item not found.', 'הפריט לא נמצא.'],
  ['Denúncia não encontrada.', 'Report not found.', 'הדיווח לא נמצא.'],

  // Conta e sessão
  ['E-mail ou senha incorretos.', 'Incorrect email or password.', 'הדוא״ל או הסיסמה שגויים.'],
  ['Sessão encerrada. Faça login novamente.', 'Your session has ended. Please sign in again.', 'ההתחברות הסתיימה. יש להתחבר מחדש.'],
  ['Sessão expirada. Faça login novamente.', 'Your session has expired. Please sign in again.', 'תוקף ההתחברות פג. יש להתחבר מחדש.'],
  ['Este e-mail já está cadastrado.', 'This email is already registered.', 'כתובת הדוא״ל הזו כבר רשומה.'],
  ['Esta conta não tem permissão de revisão.', 'This account is not allowed to review questions.', 'לחשבון הזה אין הרשאה לבדוק שאלות.'],
  ['Senha incorreta.', 'Incorrect password.', 'הסיסמה שגויה.'],
  ['Confirme a exclusão com a sua senha.', 'Confirm the deletion with your password.', 'יש לאשר את המחיקה עם הסיסמה שלך.'],
  ['Convidados não têm senha. Crie uma conta no seu perfil.', 'Guests have no password. Create an account in your profile.', 'לאורחים אין סיסמה. אפשר ליצור חשבון בפרופיל שלך.'],
  ['A senha atual está incorreta.', 'The current password is incorrect.', 'הסיסמה הנוכחית שגויה.'],
  ['A senha nova precisa ser diferente da atual.', 'The new password must be different from the current one.', 'הסיסמה החדשה צריכה להיות שונה מהנוכחית.'],
  ['Nada para atualizar.', 'Nothing to update.', 'אין מה לעדכן.'],

  // Nome no jogo
  [`Use pelo menos ${DISPLAY_NAME_MIN} caracteres.`, `Use at least ${DISPLAY_NAME_MIN} characters.`, `יש להשתמש לפחות ב־${DISPLAY_NAME_MIN} תווים.`],
  [`Use no máximo ${DISPLAY_NAME_MAX} caracteres.`, `Use at most ${DISPLAY_NAME_MAX} characters.`, `יש להשתמש לכל היותר ב־${DISPLAY_NAME_MAX} תווים.`],
  [
    'Use letras (do alfabeto latino ou hebraico), números, espaço, ponto, hífen ou sublinhado.',
    'Use letters (Latin or Hebrew alphabet), numbers, spaces, periods, hyphens or underscores.',
    'אפשר להשתמש באותיות (עבריות או לטיניות), ספרות, רווח, נקודה, מקף או קו תחתון.',
  ],
  ['Este nome é reservado para a equipe do jogo. Escolha outro.', 'This name is reserved for the game team. Choose another one.', 'השם הזה שמור לצוות המשחק. בחרו שם אחר.'],
  ['Este nome não pode ser usado no jogo. Escolha outro.', 'This name cannot be used in the game. Choose another one.', 'אי אפשר להשתמש בשם הזה במשחק. בחרו שם אחר.'],

  // Senha
  [`Use pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`, `Use at least ${PASSWORD_MIN_LENGTH} characters.`, `יש להשתמש לפחות ב־${PASSWORD_MIN_LENGTH} תווים.`],
  [`Use no máximo ${PASSWORD_MAX_LENGTH} caracteres.`, `Use at most ${PASSWORD_MAX_LENGTH} characters.`, `יש להשתמש לכל היותר ב־${PASSWORD_MAX_LENGTH} תווים.`],
  ['Essa senha repete poucos caracteres. Escolha uma mais variada.', 'This password repeats too few characters. Choose a more varied one.', 'בסיסמה הזו חוזרים מעט מדי תווים. בחרו סיסמה מגוונת יותר.'],
  ['Essa senha é uma sequência óbvia. Escolha outra.', 'This password is an obvious sequence. Choose another one.', 'הסיסמה הזו היא רצף צפוי. בחרו סיסמה אחרת.'],
  ['Essa senha é fácil de adivinhar. Escolha outra.', 'This password is easy to guess. Choose another one.', 'קל לנחש את הסיסמה הזו. בחרו סיסמה אחרת.'],
  ['A senha não pode conter seu e-mail ou seu nome.', 'The password cannot contain your email or your name.', 'הסיסמה לא יכולה לכלול את הדוא״ל או את השם שלך.'],

  // Roleta
  ['A partida não está em andamento.', 'This game is not in progress.', 'המשחק הזה לא פעיל.'],
  ['A partida já terminou.', 'This game is already over.', 'המשחק הזה כבר נגמר.'],
  ['Não é a sua vez.', "It's not your turn.", 'זה לא התור שלך.'],
  ['Esta ação não está disponível agora (fase atual: {phase}).', 'This action is not available right now (current phase: {phase}).', 'הפעולה הזו לא זמינה כרגע (שלב נוכחי: {phase}).'],
  ['Código de convite não encontrado.', 'Invite code not found.', 'קוד ההזמנה לא נמצא.'],
  ['Este é o seu próprio convite: compartilhe o código com um amigo.', 'This is your own invite: share the code with a friend.', 'זו ההזמנה שלך: שתפו את הקוד עם חבר.'],
  ['Este convite já foi usado.', 'This invite has already been used.', 'כבר השתמשו בהזמנה הזו.'],
  ['Este convite venceu. Peça um código novo ao seu amigo.', 'This invite has expired. Ask your friend for a new code.', 'תוקף ההזמנה פג. בקשו מהחבר קוד חדש.'],
  [
    'Suas vidas acabaram. A próxima volta em {wait} min — enquanto isso, que tal estudar no Golem World?',
    'You are out of lives. The next one comes back in {wait} min — meanwhile, how about studying in Golem World?',
    'נגמרו לך החיים. החיים הבאים יחזרו בעוד {wait} דק׳ — ובינתיים, מה דעתך ללמוד בעולם הגולם?',
  ],
  ['Escolha uma categoria em que você ainda não tem selo.', "Choose a category whose seal you don't have yet.", 'בחרו קטגוריה שעדיין אין לכם את החותם שלה.'],
  ['Ainda não há perguntas aprovadas nesta categoria.', 'There are no approved questions in this category yet.', 'עדיין אין שאלות מאושרות בקטגוריה הזו.'],
  ['Ainda não há perguntas aprovadas. Revise as perguntas geradas em /admin.', 'There are no approved questions yet. Review the generated questions at /admin.', 'עדיין אין שאלות מאושרות. אפשר לבדוק את השאלות שנוצרו ב־‎/admin.'],
  ['Giro não encontrado ou já usado.', 'Spin not found or already used.', 'הסיבוב לא נמצא או שכבר נוצל.'],
  ['Não há pergunta aberta nesta partida.', 'There is no open question in this game.', 'אין שאלה פתוחה במשחק הזה.'],
  ['Esta pergunta já foi respondida (ou o tempo acabou).', 'This question has already been answered (or the time ran out).', 'כבר ענו על השאלה הזו (או שהזמן נגמר).'],
  ['Esta pergunta já foi respondida.', 'This question has already been answered.', 'כבר ענו על השאלה הזו.'],
  ['O tempo desta pergunta acabou.', 'The time for this question ran out.', 'הזמן לשאלה הזו נגמר.'],

  // Golem World
  ['Os caminhos desta parashá abrem depois que você completa a Torá dela.', "This parashah's study paths open once you complete its Torah level.", 'דרכי הלימוד של הפרשה הזו נפתחות אחרי שמסיימים את שלב התורה שלה.'],
  ['Esta fase ainda está fechada no mapa.', 'This level is still locked on the map.', 'השלב הזה עדיין נעול במפה.'],
  ['Esta trilha ainda não tem textos. Ela abre assim que os textos forem carregados.', 'This path has no texts yet. It opens as soon as the texts are loaded.', 'עדיין אין טקסטים בדרך הזו. היא תיפתח ברגע שהטקסטים ייטענו.'],
  ['Ainda não há textos desta fase neste idioma.', 'There are no texts for this level in this language yet.', 'עדיין אין טקסטים לשלב הזה בשפה הזו.'],
  ['Esta fase já terminou.', 'This level is already over.', 'השלב הזה כבר הסתיים.'],
  ['Você não tem mais pulos nesta fase.', 'You have no skips left in this level.', 'לא נשארו לך דילוגים בשלב הזה.'],
  ['Você não tem mais este poder nesta fase.', 'You have no more of this power in this level.', 'לא נשאר לך עוד מהכוח הזה בשלב הזה.'],
  ['Sua chavruta já deu todas as dicas desta fase.', 'Your chavruta has already given every hint for this level.', 'החברותא שלך כבר נתנה את כל הרמזים לשלב הזה.'],
  ['Você já pediu dica nesta pergunta.', 'You already asked for a hint on this question.', 'כבר ביקשת רמז בשאלה הזו.'],
  ['Esta alternativa foi eliminada.', 'This option was eliminated.', 'התשובה הזו נפסלה.'],
  ['Este item é prêmio: ele não está à venda.', 'This item is a prize: it is not for sale.', 'הפריט הזה הוא פרס: הוא לא למכירה.'],
  ['Você já tem este item.', 'You already have this item.', 'הפריט הזה כבר שלך.'],
  ['Você ainda não tem este item.', "You don't have this item yet.", 'הפריט הזה עדיין לא שלך.'],
  ['Moedas insuficientes. Jogue mais fases do Golem World!', 'Not enough coins. Play more Golem World levels!', 'אין מספיק מטבעות. שחקו עוד שלבים בעולם הגולם!'],

  // Denúncias
  ['Responda a pergunta antes de denunciá-la.', 'Answer the question before reporting it.', 'יש לענות על השאלה לפני שמדווחים עליה.'],
  ['Você já denunciou esta pergunta. Obrigado!', 'You already reported this question. Thank you!', 'כבר דיווחת על השאלה הזו. תודה!'],
  [
    'Você já enviou muitas denúncias hoje. Obrigado pela ajuda! Tente de novo amanhã.',
    'You have sent many reports today. Thanks for helping! Try again tomorrow.',
    'שלחת היום הרבה דיווחים. תודה על העזרה! נסו שוב מחר.',
  ],

  // Revisão (painel)
  ['As alternativas precisam ser diferentes entre si.', 'The options must all be different.', 'התשובות צריכות להיות שונות זו מזו.'],
  ['Já existe outra pergunta igual a esta versão editada.', 'Another question identical to this edited version already exists.', 'כבר קיימת שאלה זהה לגרסה הערוכה הזו.'],

  // Pedras do Choshen (Fase 11)
  ['Passe pelas fases anteriores para abrir esta.', 'Clear the earlier levels to unlock this one.', 'עברו את השלבים הקודמים כדי לפתוח את השלב הזה.'],
  ['Esta partida já terminou.', 'This game has already ended.', 'המשחק הזה כבר הסתיים.'],
  ['Esta partida ficou aberta tempo demais. Comece de novo.', 'This game was left open too long. Start again.', 'המשחק הזה נשאר פתוח יותר מדי זמן. התחילו מחדש.'],
  ['As jogadas não conferem com o tabuleiro desta partida.', "The moves don't match this game's board.", 'המהלכים לא תואמים ללוח של המשחק הזה.'],
  // Login social (Fase 10)
  ['Este tipo de login não está disponível.', 'This type of sign-in is not available.', 'סוג ההתחברות הזה לא זמין.'],
  ['Não foi possível confirmar o login com este serviço. Tente de novo.', "We couldn't verify the sign-in with this service. Try again.", 'לא הצלחנו לאמת את ההתחברות עם השירות הזה. נסו שוב.'],
  ['O serviço de login não respondeu agora. Tente de novo em instantes.', "The sign-in service didn't respond just now. Try again in a moment.", 'שירות ההתחברות לא ענה כרגע. נסו שוב בעוד רגע.'],
  ['Este login com {provider} já está ligado a outro jogador. Saia desta conta e entre com {provider}.', 'This {provider} sign-in is already linked to another player. Sign out of this account and sign in with {provider}.', 'ההתחברות הזו עם {provider} כבר מקושרת לשחקן אחר. צאו מהחשבון הזה והתחברו עם {provider}.'],
  ['Sua conta já tem outro login com {provider} ligado.', 'Your account already has another {provider} sign-in linked.', 'לחשבון שלך כבר מקושרת התחברות אחרת עם {provider}.'],
  ['Já existe uma conta com o e-mail deste login. Entre com e-mail e senha e conecte o login com {provider} no seu perfil.', 'There is already an account with this email. Sign in with email and password and connect {provider} sign-in in your profile.', 'כבר קיים חשבון עם הדוא״ל הזה. התחברו עם דוא״ל וסיסמה וחברו את ההתחברות עם {provider} בפרופיל.'],
  ['Esta conta foi excluída.', 'This account was deleted.', 'החשבון הזה נמחק.'],
  ['Este login não está ligado à sua conta.', 'This sign-in is not linked to your account.', 'ההתחברות הזו לא מקושרת לחשבון שלך.'],
  ['Este é o único jeito de entrar na sua conta. Ligue outro login antes de desligar este.', 'This is the only way to sign in to your account. Link another sign-in before removing this one.', 'זו הדרך היחידה להיכנס לחשבון שלך. קשרו התחברות אחרת לפני שתסירו את זו.'],

  // Limites de uso (o tempo de espera vem depois, em outra linha)
  ['Muitas tentativas seguidas.', 'Too many attempts in a row.', 'יותר מדי ניסיונות ברצף.'],
  ['Muitas tentativas de login nesta conta.', 'Too many sign-in attempts on this account.', 'יותר מדי ניסיונות התחברות לחשבון הזה.'],
  ['Muitas requisições deste endereço.', 'Too many requests from this address.', 'יותר מדי בקשות מהכתובת הזו.'],
  ['Muitas requisições desta conta.', 'Too many requests from this account.', 'יותר מדי בקשות מהחשבון הזה.'],
  ['Tente de novo em 1 minuto.', 'Try again in 1 minute.', 'נסו שוב בעוד דקה.'],
  ['Tente de novo em {n} minutos.', 'Try again in {n} minutes.', 'נסו שוב בעוד {n} דקות.'],
  ['Tente de novo em 1 hora.', 'Try again in 1 hour.', 'נסו שוב בעוד שעה.'],
  ['Tente de novo em {n} horas.', 'Try again in {n} hours.', 'נסו שוב בעוד {n} שעות.'],
  // Economia (Fase 9)
  ['Shekels insuficientes.', 'Not enough shekels.', 'אין מספיק שקלים.'],
  ['Sua mochila já está cheia desta ajuda.', 'Your backpack is already full of this boost.', 'התרמיל שלכם כבר מלא בעזרה הזאת.'],
  ['Suas vidas já estão cheias.', 'Your lives are already full.', 'החיים שלכם כבר מלאים.'],
  ['Oferta não encontrada.', 'Offer not found.', 'ההצעה לא נמצאה.'],
  ['Produto desconhecido.', 'Unknown product.', 'מוצר לא מוכר.'],
  ['A loja não está disponível nesta versão do jogo.', 'The store is not available in this version of the game.', 'החנות לא זמינה בגרסה הזאת של המשחק.'],
  ['Não foi possível confirmar esta compra com a loja.', 'We could not confirm this purchase with the store.', 'לא הצלחנו לאמת את הרכישה מול החנות.'],
  ['A loja não respondeu agora. Sua compra não se perdeu: tente de novo em instantes.', "The store didn't respond just now. Your purchase isn't lost: try again in a moment.", 'החנות לא ענתה כרגע. הרכישה לא אבדה: נסו שוב בעוד רגע.'],
  ['O pagamento ainda está sendo processado. Assim que ele for aprovado, a compra aparece aqui.', 'The payment is still being processed. As soon as it is approved, the purchase will show up here.', 'התשלום עדיין בעיבוד. ברגע שיאושר, הרכישה תופיע כאן.'],
  ['Esta compra foi reembolsada pela loja.', 'This purchase was refunded by the store.', 'הרכישה הזאת הוחזרה על ידי החנות.'],
  ['Esta compra pertence a outra conta do jogo.', 'This purchase belongs to another game account.', 'הרכישה הזאת שייכת לחשבון אחר במשחק.'],
  ['Este personagem aparece numa parashá que você ainda não estudou.', "This character appears in a parashah you haven't studied yet.", 'הדמות הזאת מופיעה בפרשה שעוד לא למדתם.'],
  ['Você já ganhou tempo nesta pergunta.', 'You already got extra time on this question.', 'כבר קיבלתם זמן נוסף בשאלה הזאת.'],
  ['Já não há alternativas erradas para tirar.', 'There are no wrong answers left to remove.', 'לא נשארו תשובות שגויות להסיר.'],
  ['Os anúncios com prêmio não estão disponíveis agora.', 'Rewarded ads are not available right now.', 'מודעות עם פרס לא זמינות כרגע.'],
  ['Este prêmio só aparece nas pausas do jogo.', 'This prize only appears during breaks in the game.', 'הפרס הזה מופיע רק בהפסקות של המשחק.'],
  ['Este prêmio já foi resgatado.', 'This prize has already been claimed.', 'הפרס הזה כבר מומש.'],
  ['Este prêmio não está disponível agora.', 'This prize is not available right now.', 'הפרס הזה לא זמין כרגע.'],
  ['O prazo deste prêmio acabou.', 'The time to claim this prize is over.', 'הזמן למימוש הפרס הזה נגמר.'],
  ['Você já ganhou todos os prêmios deste tipo hoje. Volte amanhã!', "You've already earned every prize of this kind today. Come back tomorrow!", 'כבר קיבלתם היום את כל הפרסים מהסוג הזה. חזרו מחר!'],
  ['Falta dizer a que fase ou rodada o prêmio se refere.', 'Missing which level or round this prize is for.', 'חסר לאיזה שלב או סבב הפרס שייך.'],
  ['Rodada não encontrada.', 'Round not found.', 'הסבב לא נמצא.'],
  ['Prêmio não encontrado.', 'Prize not found.', 'הפרס לא נמצא.'],
  ['Este anúncio é confirmado pelo Google, não pelo aplicativo.', 'This ad is confirmed by Google, not by the app.', 'המודעה הזאת מאומתת על ידי Google, לא על ידי האפליקציה.'],
  ['Assinatura do anúncio inválida.', 'Invalid ad signature.', 'חתימת המודעה לא תקינה.'],
];

const BY_LOCALE: Readonly<Record<'en' | 'he', ReadonlyMap<string, string>>> = {
  en: new Map(ROWS.map(([pt, en]) => [pt, en])),
  he: new Map(ROWS.map(([pt, , he]) => [pt, he])),
};

function fill(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in params ? String(params[key]) : whole));
}

/**
 * Mensagem no idioma pedido. Sem tradução cadastrada, volta o molde em português
 * (preenchido), para nunca mostrar uma chave crua.
 */
export function messageText(pt: string, locale: Locale, params?: MessageParams): string {
  const template = locale === 'pt' ? pt : (BY_LOCALE[locale].get(pt) ?? pt);
  return fill(template, params);
}

/** A frase existe nos três idiomas? (para o app e para os testes) */
export function hasMessage(pt: string): boolean {
  return BY_LOCALE.en.has(pt);
}

/** Todas as mensagens em português (para os testes de cobertura). */
export const MESSAGE_KEYS: readonly string[] = ROWS.map(([pt]) => pt);

/** "Tente de novo em 3 minutos." no idioma pedido, a partir de milissegundos. */
export function retryAfterText(ms: number, locale: Locale): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes <= 1) return messageText('Tente de novo em 1 minuto.', locale);
  if (minutes < 60) return messageText('Tente de novo em {n} minutos.', locale, { n: minutes });
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? messageText('Tente de novo em 1 hora.', locale) : messageText('Tente de novo em {n} horas.', locale, { n: hours });
}
