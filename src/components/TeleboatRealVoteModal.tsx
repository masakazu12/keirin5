import React, { useState } from 'react';
import {
  Send,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  AlertTriangle,
  Wallet,
  Zap,
  Info,
  Clock,
  X,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { RaceInfo, BetCandidate } from '../types/kyotei';
import {
  AutoVoteConfig,
  generateTeleboatBatchPayload,
  generateTeleboatAutoFillBookmarklet,
  generateTeleboatTicketSummary,
  openTeleboatWebPortal,
} from '../services/teleboatService';

interface TeleboatRealVoteModalProps {
  race: RaceInfo;
  candidates: BetCandidate[];
  config: AutoVoteConfig;
  onConfirmRealVote: (officialReceptionNo?: string) => void;
  onOpenBalanceSync: () => void;
  onClose: () => void;
}

export const TeleboatRealVoteModal: React.FC<TeleboatRealVoteModalProps> = ({
  race,
  candidates,
  config,
  onConfirmRealVote,
  onOpenBalanceSync,
  onClose,
}) => {
  const [officialReceptionNo, setOfficialReceptionNo] = useState<string>('');
  const [hasConfirmedOnTeleboat, setHasConfirmedOnTeleboat] = useState<boolean>(true);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [copiedData, setCopiedData] = useState<boolean>(false);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);

  const validBets = candidates.filter((c) => c.stake > 0);
  const totalStake = validBets.reduce((sum, c) => sum + c.stake, 0);
  const remainingBalance = config.accountBalance - totalStake;
  const isBalanceSufficient = remainingBalance >= 0;

  const handleCopyScript = () => {
    const script = generateTeleboatAutoFillBookmarklet(race, validBets);
    navigator.clipboard.writeText(script);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  const handleCopyData = () => {
    const data = generateTeleboatBatchPayload(race, validBets);
    navigator.clipboard.writeText(data);
    setCopiedData(true);
    setTimeout(() => setCopiedData(false), 2500);
  };

  const handleCopySummary = () => {
    const summary = generateTeleboatTicketSummary(race, validBets, config.accountBalance);
    navigator.clipboard.writeText(summary);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanceSufficient) return;
    onConfirmRealVote(officialReceptionNo.trim() || undefined);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 backdrop-blur-xs p-3 animate-in fade-in duration-150 select-none">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-100">
        {/* ヘッダー */}
        <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-md">
              <Send className="w-4 h-4 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-100 text-sm">
                  テレボート公式 実投票マネージャー
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500 animate-pulse">
                  実投票 連携モード
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                公式テレボート（ib.mbrace.or.jp / spweb.brtb.jp）への買い目送信・購入限度額の確定減算
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* コンテンツ本体 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-sans">
          {/* レース概要 & 残高比較カード */}
          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-1 rounded bg-blue-600 text-white font-black text-xs">
                  {race.venue}
                </span>
                <span className="font-bold text-slate-200 text-sm">
                  第{race.raceNo}R {race.raceTitle}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>締切時刻: {race.deadlineTime || '発売中'}</span>
                <span>|</span>
                <span>日付: {race.date}</span>
              </div>
            </div>

            {/* 金額・残高カード */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-900/90 p-2.5 rounded border border-slate-800">
                <span className="text-[10px] text-slate-400 block mb-0.5">投票合計金額</span>
                <span className="font-mono text-base font-black text-emerald-400">
                  ¥{totalStake.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">({validBets.length}点)</span>
              </div>

              <div className="bg-slate-900/90 p-2.5 rounded border border-slate-800">
                <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 mb-0.5">
                  <span>購入限度額 (実残高)</span>
                </div>
                <span className="font-mono text-base font-black text-amber-300">
                  ¥{config.accountBalance.toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={onOpenBalanceSync}
                  className="text-[10px] text-amber-400 hover:underline block mx-auto mt-0.5 cursor-pointer"
                >
                  [限度額を同期・変更]
                </button>
              </div>

              <div className={`p-2.5 rounded border ${
                isBalanceSufficient
                  ? 'bg-slate-900/90 border-slate-800 text-slate-300'
                  : 'bg-rose-950/60 border-rose-600 text-rose-300'
              }`}>
                <span className="text-[10px] text-slate-400 block mb-0.5">投票後 限度額</span>
                <span className={`font-mono text-base font-black ${
                  isBalanceSufficient ? 'text-cyan-300' : 'text-rose-400'
                }`}>
                  ¥{Math.max(0, remainingBalance).toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {isBalanceSufficient ? '残高充分' : '残高不足！'}
                </span>
              </div>
            </div>

            {/* 残高不足エラーバナー */}
            {!isBalanceSufficient && (
              <div className="p-2.5 bg-rose-950/80 border border-rose-500 rounded text-rose-200 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>
                    テレボート購入限度額が不足しています (不足額: ¥{Math.abs(remainingBalance).toLocaleString()})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onOpenBalanceSync}
                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded text-[11px] cursor-pointer shrink-0"
                >
                  実残高を同期・入金
                </button>
              </div>
            )}
          </div>

          {/* 買い目一覧表 (マークカード風) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-200">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                <span>投票対象の3連単 買い目一覧</span>
              </span>
              <button
                type="button"
                onClick={handleCopySummary}
                className="text-[11px] text-cyan-300 hover:text-white flex items-center gap-1 cursor-pointer font-normal"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedSummary ? '伝票コピー完了' : '投票指図伝票をコピー'}</span>
              </button>
            </div>

            <div className="border border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-left font-mono">
                <thead className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3">式別 / 組み合わせ</th>
                    <th className="py-2 px-3 text-right">オッズ</th>
                    <th className="py-2 px-3 text-right">投票金額</th>
                    <th className="py-2 px-3 text-right">想定払戻</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
                  {validBets.map((b, idx) => (
                    <tr key={b.combination} className="hover:bg-slate-800/40">
                      <td className="py-1.5 px-3">
                        <span className="text-[11px] text-slate-400 mr-2">#{idx + 1}</span>
                        <span className="text-xs font-bold text-slate-200">3連単</span>
                        <span className="text-amber-300 font-bold text-sm ml-2">
                          {b.combination}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 text-right text-slate-300">
                        {b.odds.toFixed(1)}倍
                      </td>
                      <td className="py-1.5 px-3 text-right font-black text-emerald-400">
                        ¥{b.stake.toLocaleString()}
                      </td>
                      <td className="py-1.5 px-3 text-right text-slate-300 font-bold">
                        ¥{(b.expectedReturn || Math.floor(b.stake * b.odds)).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 実投票ステップ支援: 3つの送出ツール */}
          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2.5">
            <h4 className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-yellow-400" />
              <span>ステップ1: テレボート公式投票サイトへ買い目を送出</span>
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              テレボート公式のセキュリティ要件（暗証番号およびreCAPTCHA Enterprise認証）により、公式Webページで投票を完了させます。以下のボタンから簡単に買い目を展開できます：
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {/* PC版 テレボート */}
              <button
                type="button"
                onClick={() => {
                  handleCopyData();
                  openTeleboatWebPortal('PC');
                }}
                className="p-2.5 rounded-lg bg-blue-950 hover:bg-blue-900 border border-blue-600 text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between text-cyan-200 font-bold text-xs mb-1">
                  <span>💻 PC版 テレボートを開く</span>
                  <ExternalLink className="w-3.5 h-3.5 text-cyan-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <p className="text-[10px] text-slate-400">
                  ib.mbrace.or.jp を別タブで開き、買い目データをクリップボードへ自動コピーします
                </p>
              </button>

              {/* スマホ版 テレボート */}
              <button
                type="button"
                onClick={() => {
                  handleCopyData();
                  openTeleboatWebPortal('SP');
                }}
                className="p-2.5 rounded-lg bg-indigo-950 hover:bg-indigo-900 border border-indigo-600 text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between text-indigo-200 font-bold text-xs mb-1">
                  <span>📱 スマホ版 テレボートを開く</span>
                  <ExternalLink className="w-3.5 h-3.5 text-indigo-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <p className="text-[10px] text-slate-400">
                  spweb.brtb.jp（モバイル最適化）を開いてスマートに投票送信
                </p>
              </button>
            </div>

            {/* クイックツールボタン */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyScript}
                className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-850 text-cyan-300 border border-slate-700 flex items-center gap-1.5 cursor-pointer text-[11px] font-bold"
                title="テレボート投票画面のURL欄または開発者コンソールで実行可能な自動入力スクリプト"
              >
                <Zap className="w-3 h-3 text-cyan-400" />
                <span>{copiedScript ? 'スクリプトコピー完了！' : '自動入力スクリプトをコピー'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyData}
                className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-700 flex items-center gap-1.5 cursor-pointer text-[11px]"
                title="テレボート標準一括送信CSVデータをクリップボードにコピー"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedData ? 'CSVデータコピー完了！' : '一括送信CSVをコピー'}</span>
              </button>
            </div>
          </div>

          {/* ステップ2: 実投票完了の確定フォーム */}
          <form onSubmit={handleSubmit} className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-3">
            <h4 className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>ステップ2: 公式テレボートでの投票完了を確定 & 残高減算</span>
            </h4>

            <p className="text-[11px] text-slate-400">
              テレボート公式で暗証番号・投票用パスワードを入力して投票完了後、以下に受付番号（任意）を入力して確定してください。アプリ内の購入限度額から正確に <strong className="text-emerald-400 font-mono">¥{totalStake.toLocaleString()}</strong> が減算されます。
            </p>

            <div className="space-y-1.5">
              <label className="block text-slate-300 font-bold text-[11px]">
                公式受付番号（テレボート投票完了画面に表示される番号・任意入力）:
              </label>
              <input
                type="text"
                placeholder="例: 88123456 (空欄の場合は現在時刻で公式参照番号を発行)"
                value={officialReceptionNo}
                onChange={(e) => setOfficialReceptionNo(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <label className="flex items-center gap-2 p-2 bg-slate-900/80 rounded border border-slate-800 cursor-pointer text-[11px]">
              <input
                type="checkbox"
                checked={hasConfirmedOnTeleboat}
                onChange={(e) => setHasConfirmedOnTeleboat(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-0"
              />
              <span className="text-slate-300 font-medium">
                公式テレボート画面で投票内容（{validBets.length}点・計¥{totalStake.toLocaleString()}）を確認し、投票を送信しました
              </span>
            </label>

            {/* 送信ボタンバー */}
            <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
              >
                投票をキャンセル（残高変更なし）
              </button>

              <button
                type="submit"
                disabled={!isBalanceSufficient || !hasConfirmedOnTeleboat}
                className="px-5 py-2 rounded bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-lg flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>実投票完了を確定（購入限度額から ¥{totalStake.toLocaleString()} 減算）</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
