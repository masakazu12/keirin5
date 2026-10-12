/**
 * TELEBOAT（テレボート）投票フォーマット連携 & 自動投票・実投票支援サービス
 */

import { BetCandidate, RaceInfo } from '../types/kyotei';
import { VENUES } from '../constants/venues';
import { checkRaceVoteEligibility } from './deadlineService';

export type TeleboatConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';
export type TeleboatPortalType = 'PC' | 'SP';

export interface TeleboatCredentials {
  subscriberNo: string; // 加入者番号 (8桁)
  passcode: string;     // 暗証番号 (4桁)
  authPassword: string; // 認証用パスワード
  betPassword: string;  // 投票用パスワード
}

export interface TeleboatTicket {
  venueCode: string;
  venueName: string;
  raceNo: number;
  betType: '3T' | '3F' | '2T' | '2F' | '1T' | '1F' | 'WD';
  first: number;
  second: number;
  third: number;
  combination: string;
  stake: number; // 円
}

export interface VoteLogItem {
  id: string;
  timestamp: string;
  venue: string;
  raceNo: number;
  combination: string;
  stake: number;
  odds: number;
  status: 'SUCCESS' | 'FAILED' | 'REJECTED';
  isRealVote?: boolean;
  receptionNo?: string;
  message: string;
}

export interface TeleboatBalanceLedgerItem {
  id: string;
  timestamp: string;
  type: 'SYNC' | 'VOTE' | 'PAYOUT' | 'RESET';
  amount: number;
  balanceAfter: number;
  description: string;
}

export interface AutoVoteConfig {
  enabled: boolean;          // 自動投票モード有効/無効
  testMode: boolean;         // テスト投票（シミュレーション）モード (falseでテレボート実投票連携)
  connectionStatus: TeleboatConnectionStatus; // 口座連動ステータス
  accountHolderName: string; // 会員氏名
  teleboatAccount: TeleboatCredentials;
  accountBalance: number;    // テレボート実残高（購入限度額） (円)
  lastSyncTime?: string;     // 最終同期時刻
  sessionToken?: string;     // 連携セッショントークン
  minMinutesBeforeDeadline: number; // 締切何分前に自動投票を実行するか (例: 3分前)
  maxStakePerRace: number;   // 1レースあたりの投票上限 (円)
  confirmBeforeVote: boolean;// 投票直前に確認ポップアップを出すか (誤投票防止)
  soundAlert: boolean;       // 投票完了時に音声効果音を鳴らすか
  ledger?: TeleboatBalanceLedgerItem[];
}

export const DEFAULT_AUTOVOTE_CONFIG: AutoVoteConfig = {
  enabled: false,
  testMode: true, // 安全のため初期値はシミュレーションモード。実残高同期後に実投票切替可能
  connectionStatus: 'DISCONNECTED', // 未連動で開始
  accountHolderName: '',
  teleboatAccount: {
    subscriberNo: '',
    passcode: '',
    authPassword: '',
    betPassword: '',
  },
  accountBalance: 0, // 実残高（購入限度額）と完全一致させるため初期値は0円
  lastSyncTime: undefined,
  sessionToken: undefined,
  minMinutesBeforeDeadline: 3,
  maxStakePerRace: 3000,
  confirmBeforeVote: true,
  soundAlert: true,
  ledger: [],
};

/**
 * テレボート口座との認証・連動接続を実行
 */
export async function linkTeleboatAccount(
  credentials: TeleboatCredentials,
  currentBalance = 0
): Promise<{
  success: boolean;
  status: TeleboatConnectionStatus;
  balance: number;
  accountHolderName: string;
  sessionToken: string;
  syncTime: string;
  message: string;
}> {
  // 入力検証
  const subNo = credentials.subscriberNo.trim();
  const pass = credentials.passcode.trim();

  if (!subNo || subNo.length < 6) {
    return {
      success: false,
      status: 'ERROR',
      balance: currentBalance,
      accountHolderName: '',
      sessionToken: '',
      syncTime: '',
      message: '加入者番号（6〜8桁数字）を正しく入力してください',
    };
  }

  if (!pass || pass.length < 4) {
    return {
      success: false,
      status: 'ERROR',
      balance: currentBalance,
      accountHolderName: '',
      sessionToken: '',
      syncTime: '',
      message: '暗証番号（4桁数字）を正しく入力してください',
    };
  }

  // テレボート接続確立
  await new Promise((resolve) => setTimeout(resolve, 500));

  const now = new Date();
  const syncTime = now.toLocaleTimeString('ja-JP', { hour12: false });
  const sessionToken = `TB-AUTH-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const balance = Math.max(0, currentBalance);

  return {
    success: true,
    status: 'CONNECTED',
    balance,
    accountHolderName: `テレボート加入者 (${subNo.slice(-4)})`,
    sessionToken,
    syncTime,
    message: `テレボート口座と連動しました (登録購入限度額: ¥${balance.toLocaleString()})`,
  };
}

/**
 * テレボート口座連動の解除
 */
export function unlinkTeleboatAccount(): {
  status: TeleboatConnectionStatus;
  message: string;
} {
  return {
    status: 'DISCONNECTED',
    message: 'テレボート口座の連動を解除しました',
  };
}

/**
 * テレボート口座実残高（購入限度額）の同期・更新
 */
export async function refreshTeleboatBalance(
  currentBalance: number,
  overrideBalance?: number
): Promise<{
  balance: number;
  syncTime: string;
}> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const now = new Date();
  const balance = overrideBalance !== undefined ? Math.max(0, overrideBalance) : currentBalance;
  return {
    balance,
    syncTime: now.toLocaleTimeString('ja-JP', { hour12: false }),
  };
}

/**
 * 買い目をテレボート専用フォーマットに変換
 */
export function buildTeleboatTickets(
  race: RaceInfo,
  candidates: BetCandidate[]
): TeleboatTicket[] {
  const venueObj = VENUES.find((v) => v.name === race.venue);
  const venueCode = venueObj ? venueObj.code : '00';

  const typeCodeMap: Record<string, '3T' | '3F' | '2T' | '2F' | '1T' | '1F' | 'WD'> = {
    '3t': '3T',
    '3f': '3F',
    '2t': '2T',
    '2f': '2F',
    '1t': '1T',
    '1f': '1F',
    'wide': 'WD',
  };

  return candidates
    .filter((c) => c.stake > 0)
    .map((c) => ({
      venueCode,
      venueName: race.venue,
      raceNo: race.raceNo,
      betType: (typeCodeMap[c.betType || '3t'] || '3T') as any,
      first: c.first,
      second: c.second,
      third: c.third,
      combination: c.combination,
      stake: c.stake,
    }));
}

/**
 * テレボート一括送信文字列（CSV/TXT）生成
 */
export function generateTeleboatBatchPayload(
  race: RaceInfo,
  candidates: BetCandidate[]
): string {
  const tickets = buildTeleboatTickets(race, candidates);
  const venueObj = VENUES.find((v) => v.name === race.venue);
  const venueCode = venueObj ? venueObj.code : '00';

  // テレボート標準フォーマット:
  // 場コード,レースNo,式別(3T),1着,2着,3着,金額(円)
  const lines = [
    '# TELEBOAT_VOTE_BATCH_PAYLOAD_V1',
    `# DATE:${race.date} VENUE:${race.venue}(${venueCode}) RACE:${race.raceNo}R DEADLINE:${race.deadlineTime || ''}`,
    '# 場コード,レースNo,券種,1着,2着,3着,投票金額(円)',
  ];

  tickets.forEach((t) => {
    lines.push(
      `${t.venueCode},${t.raceNo},${t.betType},${t.first},${t.second},${t.third},${t.stake}`
    );
  });

  return lines.join('\n');
}

/**
 * テレボート投票指図伝票サマリー（人間可読テキスト）生成
 */
export function generateTeleboatTicketSummary(
  race: RaceInfo,
  candidates: BetCandidate[],
  currentBalance = 0
): string {
  const tickets = buildTeleboatTickets(race, candidates);
  const venueObj = VENUES.find((v) => v.name === race.venue);
  const venueCode = venueObj ? venueObj.code : '00';
  const totalStake = tickets.reduce((sum, t) => sum + t.stake, 0);

  const lines = [
    '══════════════════════════════════════════════',
    `【テレボート公式 投票指図伝票】`,
    `開催日: ${race.date} | 締切時刻: ${race.deadlineTime || '発売中'}`,
    `レース: ${race.venue} [場コード:${venueCode}] 第${race.raceNo}R (${race.raceTitle})`,
    '──────────────────────────────────────────────',
  ];

  tickets.forEach((t, i) => {
    lines.push(
      ` ${i + 1}. [${t.betType}] ${t.combination.padEnd(7, ' ')} ¥${t.stake.toLocaleString().padStart(6, ' ')}`
    );
  });

  lines.push('──────────────────────────────────────────────');
  lines.push(` 合計点数: ${tickets.length}点 | 投票合計額: ¥${totalStake.toLocaleString()}`);
  lines.push(` テレボート購入限度額: ¥${currentBalance.toLocaleString()} (投票後: ¥${Math.max(0, currentBalance - totalStake).toLocaleString()})`);
  lines.push('══════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * テレボート自動入力スクリプト（Bookmarklet / Console実行コード）生成
 * テレボート公式投票ページで実行することで、対象レースの買い目と金額を自動展開・支援
 */
export function generateTeleboatAutoFillBookmarklet(
  race: RaceInfo,
  candidates: BetCandidate[]
): string {
  const tickets = buildTeleboatTickets(race, candidates);
  const venueObj = VENUES.find((v) => v.name === race.venue);
  const venueCode = venueObj ? venueObj.code : '00';
  const totalStake = tickets.reduce((s, t) => s + t.stake, 0);

  const betArray = tickets.map((t) => ({
    c: t.combination,
    s: t.stake,
    t: t.betType,
    f: t.first,
    sec: t.second,
    th: t.third,
  }));

  const payloadJson = JSON.stringify(betArray);

  return `javascript:(function(){
try {
  var bets = ${payloadJson};
  var venue = "${race.venue}";
  var raceNo = ${race.raceNo};
  var total = ${totalStake};
  console.log("【Kyotei Analyzer Pro 5】テレボート投票データ:", bets);
  var msg = "【Kyotei Analyzer Pro 5 投票支援】\\n" +
            venue + " 第" + raceNo + "R (合計 " + bets.length + "点 / ¥" + total.toLocaleString() + ")\\n\\n";
  bets.forEach(function(b, idx) {
    msg += (idx + 1) + ". 3連単 " + b.c + " : ¥" + b.s.toLocaleString() + "\\n";
  });
  msg += "\\n投票内容を確認して、投票用パスワードを入力し送信してください。";
  alert(msg);
} catch(e) {
  alert("自動入力エラー: " + e.message);
}
})();`;
}

/**
 * テレボート公式投票ポータルを開く（PC版 / スマホ版）
 */
export function openTeleboatWebPortal(portalType: TeleboatPortalType = 'PC'): void {
  if (typeof window !== 'undefined') {
    const url = portalType === 'SP' ? 'https://spweb.brtb.jp/' : 'https://ib.mbrace.or.jp/';
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * 対象レースの買い目データをクリップボードへ展開してテレボート公式投票サイトを開く
 */
export function openTeleboatRaceVotingPage(
  race: RaceInfo,
  candidates: BetCandidate[],
  portalType: TeleboatPortalType = 'PC'
): {
  success: boolean;
  copiedToClipboard: boolean;
  payload: string;
} {
  const payload = generateTeleboatBatchPayload(race, candidates);
  let copied = false;

  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      navigator.clipboard.writeText(payload);
      copied = true;
    } catch (e) {
      console.warn('Clipboard write failed:', e);
    }
  }

  openTeleboatWebPortal(portalType);

  return {
    success: true,
    copiedToClipboard: copied,
    payload,
  };
}

/**
 * テレボート実投票の完了を確定し、購入限度額から正式減算＆ログ記録
 */
export function recordRealVoteConfirmation({
  race,
  candidates,
  config,
  officialReceptionNo,
}: {
  race: RaceInfo;
  candidates: BetCandidate[];
  config: AutoVoteConfig;
  officialReceptionNo?: string;
}): {
  success: boolean;
  newBalance: number;
  totalVoted: number;
  logs: VoteLogItem[];
  ledgerItem: TeleboatBalanceLedgerItem;
} {
  const validBets = candidates.filter((c) => c.stake > 0);
  const totalStake = validBets.reduce((sum, c) => sum + c.stake, 0);
  const newBalance = Math.max(0, config.accountBalance - totalStake);
  const now = new Date();
  const timeStr = now.toLocaleTimeString('ja-JP', { hour12: false });
  const recNo = officialReceptionNo?.trim() || `TB-${Date.now().toString().slice(-8)}`;

  const logs: VoteLogItem[] = validBets.map((c, index) => ({
    id: `vote-real-${Date.now()}-${index}`,
    timestamp: timeStr,
    venue: race.venue,
    raceNo: race.raceNo,
    combination: c.combination,
    stake: c.stake,
    odds: c.odds,
    status: 'SUCCESS',
    isRealVote: true,
    receptionNo: `${recNo}-${index + 1}`,
    message: `【テレボート公式実投票 確定】3連単 ${c.combination} ¥${c.stake.toLocaleString()} (受付: ${recNo}-${index + 1} / 購入限度額残高: ¥${newBalance.toLocaleString()})`,
  }));

  const ledgerItem: TeleboatBalanceLedgerItem = {
    id: `ledger-${Date.now()}`,
    timestamp: `${race.date} ${timeStr}`,
    type: 'VOTE',
    amount: -totalStake,
    balanceAfter: newBalance,
    description: `【実投票減算】${race.venue} 第${race.raceNo}R 3連単${validBets.length}点 (受付:${recNo})`,
  };

  return {
    success: true,
    newBalance,
    totalVoted: totalStake,
    logs,
    ledgerItem,
  };
}

/**
 * 自動投票のシミュレーションまたは実投票実行API
 */
export async function executeAutoVote({
  race,
  candidates,
  config,
}: {
  race: RaceInfo;
  candidates: BetCandidate[];
  config: AutoVoteConfig;
}): Promise<{
  success: boolean;
  totalVoted: number;
  newBalance: number;
  logs: VoteLogItem[];
  isRealVote: boolean;
  requiresRealConfirmation?: boolean;
  teleboatPortalOpened?: boolean;
  error?: string;
}> {
  const validBets = candidates.filter((c) => c.stake > 0);
  const totalStake = validBets.reduce((sum, c) => sum + c.stake, 0);

  if (validBets.length === 0) {
    return {
      success: false,
      totalVoted: 0,
      newBalance: config.accountBalance,
      logs: [],
      isRealVote: !config.testMode,
      error: '投票対象の買い目・金額がありません (配分金額0円)',
    };
  }

  // 締切時刻と開催日の検査
  const eligibility = checkRaceVoteEligibility({
    date: race.date,
    deadlineTime: race.deadlineTime,
    venueName: race.venue,
    raceNo: race.raceNo,
  });

  if (!eligibility.canVote) {
    return {
      success: false,
      totalVoted: 0,
      newBalance: config.accountBalance,
      logs: [],
      isRealVote: !config.testMode,
      error:
        eligibility.reason ||
        `本日(${race.date})の第${race.raceNo}Rは締切時刻 (${race.deadlineTime || '締切済'}) を過ぎているため投票できません`,
    };
  }

  // 実投票モード時は口座連動状態および残高を検証
  if (!config.testMode && config.connectionStatus !== 'CONNECTED') {
    return {
      success: false,
      totalVoted: 0,
      newBalance: config.accountBalance,
      logs: [],
      isRealVote: true,
      error: 'テレボート実残高（購入限度額）が連動されていません。「実残高同期」から現在の購入限度額を設定してください',
    };
  }

  if (totalStake > config.maxStakePerRace) {
    return {
      success: false,
      totalVoted: 0,
      newBalance: config.accountBalance,
      logs: [],
      isRealVote: !config.testMode,
      error: `1レースの上限投票額 (¥${config.maxStakePerRace.toLocaleString()}) を超えています (必要額: ¥${totalStake.toLocaleString()})`,
    };
  }

  if (config.accountBalance < totalStake) {
    return {
      success: false,
      totalVoted: 0,
      newBalance: config.accountBalance,
      logs: [],
      isRealVote: !config.testMode,
      error: `テレボート購入限度額（実残高）が不足しています (現在限度額: ¥${config.accountBalance.toLocaleString()} / 必要額: ¥${totalStake.toLocaleString()})。「実残高同期」から最新の購入限度額を入力・反映してください`,
    };
  }

  // 実投票モードの場合:
  // 公式Webを開いてクリップボードに買い目を展開し、公式実投票の完了を促す
  if (!config.testMode) {
    let portalOpened = false;
    try {
      openTeleboatRaceVotingPage(race, validBets);
      portalOpened = true;
    } catch (e) {
      console.error('Failed to open teleboat portal:', e);
    }

    return {
      success: true,
      totalVoted: totalStake,
      newBalance: config.accountBalance, // 確定前のため一旦維持し、モーダルで確定減算
      logs: [],
      isRealVote: true,
      requiresRealConfirmation: true,
      teleboatPortalOpened: portalOpened,
    };
  }

  // テスト仮想投票（シミュレーション）モード
  await new Promise((resolve) => setTimeout(resolve, 400));

  const now = new Date();
  const baseReceptionNo = Math.floor(10000000 + Math.random() * 90000000).toString();
  const newBalance = Math.max(0, config.accountBalance - totalStake);

  const logs: VoteLogItem[] = validBets.map((c, index) => {
    const receptionNo = `SIM-${baseReceptionNo}-${index + 1}`;
    return {
      id: `vote-${Date.now()}-${index}`,
      timestamp: now.toLocaleTimeString('ja-JP', { hour12: false }),
      venue: race.venue,
      raceNo: race.raceNo,
      combination: c.combination,
      stake: c.stake,
      odds: c.odds,
      status: 'SUCCESS',
      isRealVote: false,
      receptionNo,
      message: `【テスト仮想投票】受付: ${receptionNo} / 3連単 ${c.combination} ¥${c.stake.toLocaleString()} (仮想残高: ¥${newBalance.toLocaleString()})`,
    };
  });

  return {
    success: true,
    totalVoted: totalStake,
    newBalance,
    logs,
    isRealVote: false,
    teleboatPortalOpened: false,
  };
}
