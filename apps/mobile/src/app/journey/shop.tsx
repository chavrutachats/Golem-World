/**
 * Loja do Golem, em abas:
 * - Armário: equipamentos (moedas de sabedoria), com vantagens só no Golem World;
 * - Personagens: os da história (moedas de sabedoria, depois de estudar a parashá) e
 *   os visitantes de fora da Torá (shekels), como fantasias de Purim;
 * - Barro: o material do Golem (shekels);
 * - Ajudas: vidas da roleta e ajudas da mochila (shekels ou anúncio com prêmio);
 * - Shekels: pacotes e "Sem anúncios".
 *
 * Tocar num item veste o Golem só de prova, para ver antes de comprar.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BOOSTS,
  ITEM_SLOT_LABELS_PT,
  ITEM_SLOTS,
  NO_ADS_PRODUCT_ID,
  SHEKEL_OFFERS,
  STORE_PRODUCTS,
  itemById,
  itemCategory,
  sefariaUrlForRef,
  shortRef,
  type GolemLook,
  type RewardTicket,
  type ShopState,
} from '@trivia/shared';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BoostIcon, PrizeBadge } from '@/components/economy/PrizeBadge';
import { WalletChips } from '@/components/economy/WalletChips';
import { CoinIcon, HeartIcon, LockIcon, ShekelIcon } from '@/components/game/icons';
import { ItemIcon } from '@/components/game/ItemIcon';
import { GameButton, GamePanel } from '@/components/game/GameUI';
import { GameText } from '@/components/game/GameText';
import { GolemShowcase } from '@/components/three/GolemShowcase';
import { CONTENT_MAX_WIDTH } from '@/components/ui/Screen';
import { T } from '@/components/ui/Text';
import { ApiError } from '@/lib/api-core';
import { currentLocale, msg, t, tc } from '@/lib/i18n';
import {
  applyEconomy,
  boostName,
  buyProduct,
  earnReward,
  notify,
  offerReward,
  prizeLabel,
  productName,
  useMonetization,
  useStoreProducts,
  watchReward,
} from '@/lib/monetization';
import { errorMessage, keys, useShop } from '@/lib/queries';
import { api } from '@/lib/session';
import { play } from '@/lib/sound';
import { g as px } from '@/theme/game';

const TABS = ['armario', 'personagens', 'barro', 'ajudas', 'shekels'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Readonly<Record<Tab, string>> = {
  armario: msg('Armário'),
  personagens: msg('Personagens'),
  barro: msg('Barro'),
  ajudas: msg('Ajudas'),
  shekels: msg('Shekels'),
};

type ShopItem = ShopState['items'][number];

function ItemCard({
  item,
  previewing,
  busy,
  onPreview,
  onBuy,
  onEquip,
}: {
  item: ShopItem;
  previewing: boolean;
  busy: boolean;
  onPreview: () => void;
  onBuy: () => void;
  onEquip: () => void;
}) {
  const def = itemById(item.id)!;
  const name = tc(def.namePt);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('Provar {item}', { item: name })} onPress={onPreview} testID={`shop-${item.id}`}>
      <GamePanel style={[styles.item, item.equipped && styles.itemOn, previewing && !item.equipped && styles.itemPreview]}>
        <View style={styles.icon}>
          <ItemIcon id={item.id} size={44} />
        </View>
        <View style={styles.flex}>
          <T weight="bold" color={px.white}>
            {name}
            {item.equipped ? `  ·  ${t('vestido')}` : ''}
          </T>
          {def.perkPt ? (
            <T variant="small" color={px.gold}>
              {tc(def.perkPt)}
            </T>
          ) : null}
          <T variant="caption" color="#C9D3F5">
            {tc(def.flavorPt)}
          </T>
          {def.ref ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t('Ler {ref} no Sefaria', { ref: shortRef(def.ref, currentLocale()) })}
              onPress={() => void WebBrowser.openBrowserAsync(sefariaUrlForRef(def.ref!))}
              hitSlop={6}
              style={styles.link}
            >
              <T variant="caption" weight="bold" color={px.mist}>
                {t('Ler no Sefaria')}
              </T>
              <Ionicons name="open-outline" size={12} color={px.mist} />
            </Pressable>
          ) : null}
          {!item.owned && item.howToEarn ? (
            <T variant="caption" color="#FFE6A7">
              {item.howToEarn}
            </T>
          ) : null}
        </View>
        <View style={styles.action}>
          {item.owned ? (
            <GameButton label={item.equipped ? t('Tirar') : t('Vestir')} tone={item.equipped ? 'paper' : 'green'} size="sm" loading={busy} onPress={onEquip} />
          ) : item.purchasable && item.price !== null ? (
            <GameButton
              label={`${item.price}`}
              leading={item.currency === 'shekels' ? <ShekelIcon size={18} /> : <CoinIcon size={18} />}
              tone="gold"
              size="sm"
              loading={busy}
              onPress={onBuy}
              accessibilityLabel={
                item.currency === 'shekels'
                  ? t('Comprar {item} por {n} shekels', { item: name, n: item.price })
                  : t('Comprar {item} por {n} moedas', { item: name, n: item.price })
              }
              testID={`buy-${item.id}`}
            />
          ) : (
            <LockIcon size={22} color={px.mist} />
          )}
        </View>
      </GamePanel>
    </Pressable>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <GameText size="md" color={px.gold}>
        {title}
      </GameText>
      {note ? (
        <T variant="small" color="#C9D3F5">
          {note}
        </T>
      ) : null}
      {children}
    </View>
  );
}

function HelpTab() {
  const { economy, ads } = useMonetization();
  const [busy, setBusy] = useState<string | null>(null);
  const [boostOffer, setBoostOffer] = useState<RewardTicket | null>(null);
  if (!economy) return null;
  const lives = economy.lives;

  const spend = async (offerId: string) => {
    setBusy(offerId);
    try {
      applyEconomy(await api.economy.buyOffer(offerId));
      play('coin');
    } catch (e) {
      notify(e instanceof ApiError ? e.message : errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const lifeAd = async () => {
    setBusy('life-ad');
    await earnReward('life');
    setBusy(null);
  };
  /** Primeiro mostra qual ajuda vem; o anúncio só começa no segundo toque. */
  const boostAd = async () => {
    setBusy('boost-ad');
    try {
      if (!boostOffer) {
        setBoostOffer(await offerReward('boost'));
      } else {
        const result = await watchReward(boostOffer);
        if (result === 'claimed') {
          notify(prizeLabel(boostOffer.prize));
          setBoostOffer(null);
        }
      }
    } catch (e) {
      notify(e instanceof ApiError ? e.message : errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const used = economy.rewardsToday.boost;

  return (
    <>
      <Section title={t('Sua mochila')} note={t('As ajudas valem só no Golem World, quando as dos itens da fase acabam. O sevivon não tem ajuda nenhuma.')}>
        <GamePanel style={styles.backpack}>
          {BOOSTS.map((b) => (
            <View key={b} style={styles.backpackItem} accessible accessibilityLabel={`${boostName(b)}: ${economy.boosts[b]}`}>
              <BoostIcon kind={b} size={26} />
              <GameText size="lg" weight="bold">
                {economy.boosts[b]}
              </GameText>
              <T variant="caption" color={px.mist} align="center">
                {boostName(b)}
              </T>
            </View>
          ))}
        </GamePanel>
      </Section>
      <Section title={t('Com shekels')}>
        {SHEKEL_OFFERS.map((o) => (
          <GamePanel key={o.id} style={styles.item}>
            <View style={styles.icon}>{o.kind === 'lives' ? <HeartIcon size={34} /> : <BoostIcon kind={o.boost} size={30} color={px.velvet} />}</View>
            <View style={styles.flex}>
              <T weight="bold" color={px.white}>
                {o.kind === 'lives' ? t('Vidas cheias no sevivon') : t('Pacote: {n}× {name}', { n: o.amount, name: boostName(o.boost) })}
              </T>
              {o.kind === 'lives' ? (
                <T variant="caption" color="#C9D3F5">
                  {t('Agora: {n} de {max}', { n: lives.lives, max: lives.max })}
                </T>
              ) : null}
            </View>
            <GameButton
              label={`${o.price}`}
              leading={<ShekelIcon size={18} />}
              size="sm"
              loading={busy === o.id}
              disabled={!!busy || economy.wallet.shekels < o.price || (o.kind === 'lives' && lives.lives >= lives.max)}
              onPress={() => void spend(o.id)}
              testID={`offer-${o.id}`}
            />
          </GamePanel>
        ))}
      </Section>
      {ads ? (
        <Section title={t('Com um anúncio')} note={t('Só se você quiser: o prêmio aparece antes, e o anúncio começa quando você tocar.')}>
          <GamePanel style={styles.item}>
            <View style={styles.icon}>
              <HeartIcon size={34} />
            </View>
            <View style={styles.flex}>
              <T weight="bold" color={px.white}>
                {t('+1 vida no sevivon')}
              </T>
              <T variant="caption" color="#C9D3F5">
                {lives.lives >= lives.max ? t('Suas vidas estão cheias.') : t('Agora: {n} de {max}', { n: lives.lives, max: lives.max })}
              </T>
            </View>
            <GameButton label={t('Assistir')} icon="play" tone="blue" size="sm" loading={busy === 'life-ad'} disabled={!!busy || lives.lives >= lives.max} onPress={() => void lifeAd()} testID="ad-life" />
          </GamePanel>
          <GamePanel style={styles.item}>
            <View style={styles.icon}>
              <Ionicons name="gift" size={30} color={px.velvet} />
            </View>
            <View style={styles.flex}>
              {boostOffer ? (
                <PrizeBadge prize={boostOffer.prize} size="sm" />
              ) : (
                <T weight="bold" color={px.white}>
                  {t('Uma ajuda para a mochila')}
                </T>
              )}
              <T variant="caption" color="#C9D3F5">
                {t('{used} de {cap} hoje', { used: used.used, cap: used.cap })}
              </T>
            </View>
            <GameButton
              label={boostOffer ? t('Assistir') : t('Ver prêmio')}
              icon={boostOffer ? 'play' : 'eye'}
              tone="blue"
              size="sm"
              loading={busy === 'boost-ad'}
              disabled={!!busy || used.used >= used.cap}
              onPress={() => void boostAd()}
              testID="ad-boost"
            />
          </GamePanel>
        </Section>
      ) : null}
    </>
  );
}

function ShekelsTab() {
  const { economy, store } = useMonetization();
  const ids = useMemo(() => STORE_PRODUCTS.map((p) => p.id), []);
  const prices = useStoreProducts(ids);
  const [busy, setBusy] = useState<string | null>(null);
  if (!economy) return null;
  const priceOf = (id: string) => prices.data?.find((p) => p.id === id)?.price ?? null;

  const buy = async (productId: string) => {
    setBusy(productId);
    try {
      await buyProduct(productId);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t('A compra não foi concluída. Nada foi cobrado.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <T variant="small" color="#C9D3F5">
        {t('Shekels compram o material do Golem, os personagens visitantes, vidas e ajudas. Nada que decida uma partida do sevivon: lá todo mundo joga igual.')}
      </T>
      {!store ? (
        <GamePanel style={styles.note}>
          <T color={px.gold}>{t('As compras ficam disponíveis no app instalado pela App Store ou pelo Google Play.')}</T>
        </GamePanel>
      ) : store.kind === 'demo' ? (
        <GamePanel style={styles.note}>
          <T color={px.gold}>{t('Modo de demonstração: nada é cobrado.')}</T>
        </GamePanel>
      ) : null}
      {STORE_PRODUCTS.filter((p) => p.kind === 'shekels').map((p) => (
        <GamePanel key={p.id} style={styles.item}>
          <View style={styles.icon}>
            <ShekelIcon size={40} />
          </View>
          <View style={styles.flex}>
            <T weight="bold" color={px.white}>
              {productName(p.id)}
            </T>
            {p.bonusPct ? (
              <T variant="caption" color={px.gold}>
                {t('+{n}% de bônus', { n: p.bonusPct })}
              </T>
            ) : null}
          </View>
          {store ? (
            <GameButton
              label={priceOf(p.id) ?? t('Comprar')}
              size="sm"
              tone="green"
              loading={busy === p.id}
              disabled={!!busy}
              onPress={() => void buy(p.id)}
              testID={`product-${p.id}`}
            />
          ) : null}
        </GamePanel>
      ))}
      <Section title={t('Sem anúncios')}>
        <GamePanel style={styles.item}>
          <View style={styles.icon}>
            <Ionicons name="megaphone" size={30} color={px.velvet} />
          </View>
          <View style={styles.flex}>
            <T weight="bold" color={px.white}>
              {economy.adFree ? t('Você já tirou os anúncios obrigatórios.') : t('Sem anúncio obrigatório nas pausas, para sempre.')}
            </T>
            <T variant="caption" color="#C9D3F5">
              {t('Os anúncios com prêmio continuam disponíveis para quando você quiser.')}
            </T>
          </View>
          {store && !economy.adFree ? (
            <GameButton
              label={priceOf(NO_ADS_PRODUCT_ID) ?? t('Comprar')}
              size="sm"
              tone="green"
              loading={busy === NO_ADS_PRODUCT_ID}
              disabled={!!busy}
              onPress={() => void buy(NO_ADS_PRODUCT_ID)}
              testID="product-no_ads"
            />
          ) : economy.adFree ? (
            <Ionicons name="checkmark-circle" size={28} color={px.green} />
          ) : null}
        </GamePanel>
      </Section>
    </>
  );
}

export default function Shop() {
  const { width: winW } = useWindowDimensions();
  const width = Math.min(winW, CONTENT_MAX_WIDTH);
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(TABS.includes(params.tab as Tab) ? (params.tab as Tab) : 'armario');
  const [preview, setPreview] = useState<string | null>(null);
  const tabsRef = useRef<ScrollViewInstance>(null);
  const tabX = useRef<Partial<Record<Tab, number>>>({});
  const showTab = (k: Tab) => {
    const x = tabX.current[k];
    if (x !== undefined) tabsRef.current?.scrollTo({ x: Math.max(0, x - 24), animated: true });
  };
  const qc = useQueryClient();
  const shop = useShop();
  const apply = (state: ShopState) => {
    qc.setQueryData(keys.shop, state);
    void qc.invalidateQueries({ queryKey: keys.journey, exact: true });
    void qc.invalidateQueries({ queryKey: keys.economy });
    void qc.invalidateQueries({ queryKey: keys.me });
  };
  const buy = useMutation({
    mutationFn: (itemId: string) => api.journey.buy(itemId),
    onSuccess: (s) => {
      play('coin');
      apply(s);
    },
  });
  const equip = useMutation({
    mutationFn: (v: { itemId: string; equipped: boolean }) => api.journey.equip(v.itemId, v.equipped),
    onSuccess: (s) => {
      play('power', 0.6);
      setPreview(null);
      apply(s);
    },
  });
  const data = shop.data;
  const busyId = (buy.isPending ? buy.variables : undefined) ?? (equip.isPending ? equip.variables?.itemId : undefined);
  const error = buy.error ?? equip.error;

  /** O Golem com o item de prova no espaço dele. */
  const look: GolemLook | undefined = useMemo(() => {
    if (!data) return undefined;
    const def = preview ? itemById(preview) : undefined;
    return def ? { equipped: { ...data.golem.equipped, [def.slot]: def.id } } : data.golem;
  }, [data, preview]);

  const card = (it: ShopItem) => (
    <ItemCard
      key={it.id}
      item={it}
      previewing={preview === it.id}
      busy={busyId === it.id}
      onPreview={() => setPreview((p) => (p === it.id ? null : it.id))}
      onBuy={() => buy.mutate(it.id)}
      onEquip={() => equip.mutate({ itemId: it.id, equipped: !it.equipped })}
    />
  );
  const byCategory = (cat: ReturnType<typeof itemCategory>) => (data?.items ?? []).filter((i) => itemCategory(itemById(i.id)!) === cat);
  const skinOn = data?.golem.equipped.skin;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.fill}>
      <StatusBar style="light" />
      <View style={[styles.column, { width }]}>
        <View style={styles.top}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Voltar')} onPress={() => router.back()} hitSlop={10} style={styles.back}>
            <Ionicons name="chevron-back" size={26} color={px.white} />
          </Pressable>
          <GameText size="lg" shadow style={styles.flex} accessibilityRole="header">
            {t('Loja do Golem')}
          </GameText>
          <WalletChips coins={data?.coins} />
        </View>
        <ScrollView ref={tabsRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
          {TABS.map((k) => (
            <Pressable
              key={k}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === k }}
              onPress={() => {
                setTab(k);
                setPreview(null);
                showTab(k);
              }}
              onLayout={(e) => {
                tabX.current[k] = e.nativeEvent.layout.x;
                // Aberta direto numa aba (ex.: pela carteira): a aba aparece inteira.
                if (k === tab) showTab(k);
              }}
              style={[styles.tab, tab === k && styles.tabOn]}
              testID={`tab-${k}`}
            >
              <GameText size="sm" weight="bold" color={tab === k ? px.ink : px.white}>
                {t(TAB_LABELS[k])}
              </GameText>
            </Pressable>
          ))}
        </ScrollView>
        {tab !== 'ajudas' && tab !== 'shekels' ? (
          // O Golem fica fixo em cima: a prova aparece na hora, de qualquer ponto da lista.
          <View style={styles.stageWrap}>
            <GolemShowcase look={look} spin style={styles.stage} background="#2C3988" testID="shop-golem" />
            {preview && !data?.items.find((i) => i.id === preview)?.equipped ? (
              <View style={styles.trying} pointerEvents="none">
                <T variant="caption" color={px.ink} align="center">
                  {t('Só de prova: toque de novo para tirar.')}
                </T>
              </View>
            ) : null}
          </View>
        ) : null}
        <ScrollView contentContainerStyle={styles.body}>
          {error ? (
            <T variant="small" color="#FFB3B3" align="center">
              {errorMessage(error)}
            </T>
          ) : null}
          {shop.isLoading ? <GameText align="center">{t('Abrindo o armário…')}</GameText> : null}

          {data && tab === 'armario' ? (
            <>
              <T variant="small" color="#C9D3F5" align="center">
                {t('As vantagens dos itens valem só no Golem World. No sevivon todo mundo joga em pé de igualdade: lá o Golem só mostra o visual.')}
              </T>
              {ITEM_SLOTS.map((slot) => {
                const items = byCategory('equipment').filter((i) => itemById(i.id)?.slot === slot);
                return items.length ? (
                  <Section key={slot} title={tc(ITEM_SLOT_LABELS_PT[slot])}>
                    {items.map(card)}
                  </Section>
                ) : null;
              })}
            </>
          ) : null}

          {data && tab === 'personagens' ? (
            <>
              <T variant="small" color="#C9D3F5" align="center">
                {t('Fantasias para o Golem, como no Purim. Só mudam o visual; as vantagens dos itens continuam valendo por baixo.')}
              </T>
              <Section title={t('Da história')} note={t('Estude a parashá onde o personagem aparece e troque por moedas de sabedoria.')}>
                {byCategory('character').filter((i) => i.currency === 'coins').map(card)}
              </Section>
              <Section title={t('Visitantes')} note={t('Personagens de fora da Torá, de visita no Golem World. Com shekels.')}>
                {byCategory('character').filter((i) => i.currency === 'shekels').map(card)}
              </Section>
            </>
          ) : null}

          {data && tab === 'barro' ? (
            <Section title={t('Material do Golem')} note={t('Só visual, com shekels.')}>
              <Pressable onPress={() => setPreview(null)} accessibilityRole="button">
                <GamePanel style={[styles.item, !skinOn && styles.itemOn]}>
                  <View style={styles.icon}>
                    <ItemIcon id="barro-original" size={44} />
                  </View>
                  <View style={styles.flex}>
                    <T weight="bold" color={px.white}>
                      {t('Barro original')}
                      {!skinOn ? `  ·  ${t('vestido')}` : ''}
                    </T>
                    <T variant="caption" color="#C9D3F5">
                      {t('O barro da lenda, de onde o Golem foi feito.')}
                    </T>
                  </View>
                  {skinOn ? (
                    <GameButton label={t('Vestir')} tone="green" size="sm" loading={busyId === skinOn} onPress={() => equip.mutate({ itemId: skinOn, equipped: false })} />
                  ) : null}
                </GamePanel>
              </Pressable>
              {byCategory('skin').map(card)}
            </Section>
          ) : null}

          {tab === 'ajudas' ? <HelpTab /> : null}
          {tab === 'shekels' ? <ShekelsTab /> : null}
          <View style={styles.fabRoom} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: px.velvetDeep },
  flex: { flex: 1 },
  column: { flex: 1, alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 6 },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  tabs: { paddingHorizontal: 12, gap: 8, paddingBottom: 6 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)' },
  tabOn: { backgroundColor: px.gold },
  body: { padding: 14, gap: 14, paddingBottom: 40 },
  stageWrap: { paddingHorizontal: 14, paddingBottom: 4 },
  stage: { height: 190, borderRadius: 20 },
  trying: { position: 'absolute', bottom: 12, alignSelf: 'center', backgroundColor: px.gold, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 2 },
  section: { gap: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  itemOn: { backgroundColor: '#26317A', borderColor: px.blue },
  itemPreview: { borderColor: px.blue },
  icon: { width: 60, height: 60, borderRadius: 18, backgroundColor: px.paper, alignItems: 'center', justifyContent: 'center' },
  action: { alignItems: 'flex-end' },
  note: { padding: 14 },
  backpack: { flexDirection: 'row', justifyContent: 'space-around', padding: 12 },
  backpackItem: { alignItems: 'center', gap: 2, flex: 1 },
  fabRoom: { height: 40 },
});
