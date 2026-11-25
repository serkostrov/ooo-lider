import type { ReactNode } from "react";
import {
  DEFAULT_PERFORMER,
  LETTERHEAD_BG_URL,
  LETTERHEAD_SIGN_URL,
  LETTERHEAD_STAMP_URL,
  LIDER_COMPANY_NAME,
  LIDER_DIRECTOR,
  LIDER_REQUISITES,
  formatPerformerLine,
} from "@/lib/request-docs/letterhead";
import { cn } from "@/lib/utils";
import {
  type BlankConfig,
  renderTemplate,
  resolveSource,
} from "./types";

/** Шапка бланка: только верх картинки, без нижней полоски на контенте. */
function LetterheadHeader() {
  return (
    <div
      className="overflow-hidden rounded-t-lg px-5 pb-2 text-center"
      style={{
        backgroundColor: "#fff",
        backgroundImage: `url(${LETTERHEAD_BG_URL})`,
        backgroundSize: "100% auto",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "top center",
        paddingTop: "18%",
      }}
    >
      <p className="text-[12px] font-semibold leading-snug text-neutral-900">
        {LIDER_COMPANY_NAME}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-neutral-700">
        {LIDER_REQUISITES}
      </p>
    </div>
  );
}

/** Нижняя декоративная полоска бланка — после контента, не поверх. */
function LetterheadFooterBar() {
  return (
    <div
      data-letterhead-footer
      className="mt-6 h-3.5 w-full shrink-0 bg-no-repeat"
      style={{
        backgroundImage: `url(${LETTERHEAD_BG_URL})`,
        backgroundSize: "100% auto",
        backgroundPosition: "bottom center",
      }}
      aria-hidden
    />
  );
}

function LetterheadFrame({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  if (!enabled) {
    return (
      <div className="mx-auto max-w-[720px] overflow-visible rounded-lg border border-neutral-300 bg-white text-neutral-900 shadow-sm">
        <div className="p-5 text-neutral-900">{children}</div>
      </div>
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col overflow-visible rounded-lg border border-neutral-300 bg-white text-neutral-900 shadow-sm">
      <LetterheadHeader />
      <div className="flex-1 overflow-visible border-t border-neutral-200/80 px-5 pb-2 pt-5 text-neutral-900">
        {children}
      </div>
      <LetterheadFooterBar />
    </div>
  );
}

function DirectorFooter() {
  return (
    <div className="mt-6 space-y-5 overflow-visible">
      <div className="relative min-h-[6.5rem] overflow-visible pt-1 text-sm text-neutral-900">
        <div className="absolute left-0 top-2 z-20 w-[5.75rem] space-y-5 text-right font-semibold">
          <p>Директор</p>
          <p>М.П.</p>
        </div>
        <img
          src={LETTERHEAD_STAMP_URL}
          alt="Печать"
          className="pointer-events-none absolute left-[1.75rem] top-3 z-10 h-[120px] w-[128px] object-contain"
        />
        <div className="absolute bottom-1 left-[7.5rem] right-[10.5rem]">
          <div className="relative flex h-9 items-end justify-center border-b border-neutral-900">
            <img
              src={LETTERHEAD_SIGN_URL}
              alt="Подпись"
              className="pointer-events-none absolute bottom-0.5 left-[8%] z-20 h-[78px] w-[128px] object-contain"
            />
          </div>
        </div>
        <p className="absolute bottom-1 right-0 z-20 font-semibold">
          / {LIDER_DIRECTOR}/
        </p>
      </div>
      <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-700">
        <p>{formatPerformerLine(DEFAULT_PERFORMER)}</p>
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function WordTablePreview({ config }: { config: BlankConfig }) {
  return (
    <LetterheadFrame enabled={config.letterhead}>
      {config.recipientLines.filter((l) => l.trim()).length > 0 && (
        <div className="mb-4 space-y-0.5 text-right text-[12px] leading-snug">
          {config.recipientLines
            .filter((l) => l.trim())
            .map((line, i) => (
              <p key={i}>{line}</p>
            ))}
        </div>
      )}
      <p className="mb-3 text-center text-sm font-semibold uppercase tracking-wide">
        Заявка (черновик конструктора)
      </p>
      <table className="w-full border-collapse text-[13px] leading-snug">
        <tbody>
          {config.tableRows.map((row, i) => (
            <tr key={row.id} className="border border-neutral-400">
              <td className="w-8 border border-neutral-400 px-1.5 py-1 text-center tabular-nums">
                {i + 1}
              </td>
              <td className="w-[38%] border border-neutral-400 px-2 py-1 font-medium leading-snug">
                {row.title || "—"}
              </td>
              <td className="border border-neutral-400 px-2 py-1 leading-snug">
                {resolveSource(row.sourceKind, row.sourceValue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {config.showDirectorBlock && <DirectorFooter />}
    </LetterheadFrame>
  );
}

function WordFaxPreview({ config }: { config: BlankConfig }) {
  return (
    <LetterheadFrame enabled={config.letterhead}>
      <div className="mb-4 space-y-0.5 text-right text-[12px] leading-snug">
        <p className="font-semibold">Кому:</p>
        {config.recipientLines
          .filter((l) => l.trim())
          .map((line, i) => (
            <p key={i}>{line}</p>
          ))}
      </div>
      <p className="mb-4 text-center text-base font-bold uppercase tracking-wide">
        {config.faxTitle.trim() || "ФАКСОГРАММА"}
      </p>
      <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-900">
        {renderTemplate(config.faxBody) || "—"}
      </div>
      {config.showDirectorBlock && <DirectorFooter />}
    </LetterheadFrame>
  );
}

function excelColLetter(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function ExcelPreview({ config }: { config: BlankConfig }) {
  const cols = config.excelColumns;
  const colCount = Math.max(cols.length, 1);

  return (
    <div className="overflow-hidden rounded-lg border border-[#c5c5c5] bg-[#f3f3f3] shadow-md">
      <div className="flex items-center gap-2 border-b border-[#217346] bg-[#217346] px-3 py-2">
        <div className="flex size-5 items-center justify-center rounded-[3px] bg-white/15 text-[11px] font-bold text-white">
          X
        </div>
        <div className="min-w-0 flex-1 truncate text-[12px] font-medium text-white">
          Заявка.xlsx — Microsoft Excel
        </div>
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-white/35" />
          <span className="size-2.5 rounded-full bg-white/35" />
          <span className="size-2.5 rounded-full bg-white/55" />
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-[#d0d0d0] bg-[#f3f3f3] px-2 py-1.5">
        <span className="w-10 shrink-0 rounded border border-[#c8c8c8] bg-white px-1.5 py-0.5 text-center text-[11px] font-semibold text-[#333]">
          A1
        </span>
        <span className="text-[12px] text-[#666]">fx</span>
        <div className="min-h-[22px] min-w-0 flex-1 truncate rounded border border-[#c8c8c8] bg-white px-2 py-0.5 text-[12px] text-[#222]">
          {cols[0]?.title?.trim() || "—"}
        </div>
      </div>

      <div className="overflow-x-auto bg-white">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <thead>
            <tr>
              <th className="w-10 border border-[#d4d4d4] bg-[#f3f3f3] px-1 py-1 text-center text-[10px] font-medium text-[#666]" />
              {Array.from({ length: colCount }, (_, i) => (
                <th
                  key={i}
                  className="min-w-[7.5rem] border border-[#d4d4d4] bg-[#f3f3f3] px-2 py-1 text-center text-[11px] font-semibold text-[#444]"
                >
                  {excelColLetter(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-[#d4d4d4] bg-[#f3f3f3] px-1 py-1.5 text-center text-[11px] font-medium text-[#666]">
                1
              </td>
              {cols.map((col) => (
                <td
                  key={col.id}
                  className="border border-[#d4d4d4] bg-[#e2efda] px-2.5 py-1.5 text-[12px] font-semibold text-[#1f1f1f]"
                >
                  {col.title.trim() || "—"}
                </td>
              ))}
            </tr>
            <tr>
              <td className="border border-[#d4d4d4] bg-[#f3f3f3] px-1 py-1.5 text-center text-[11px] font-medium text-[#666]">
                2
              </td>
              {cols.map((col) => (
                <td
                  key={col.id}
                  className="border border-[#d4d4d4] bg-white px-2.5 py-1.5 text-[12px] text-[#222]"
                >
                  {resolveSource(col.sourceKind, col.sourceValue)}
                </td>
              ))}
            </tr>
            {[3, 4, 5].map((row) => (
              <tr key={row}>
                <td className="border border-[#d4d4d4] bg-[#f3f3f3] px-1 py-1.5 text-center text-[11px] font-medium text-[#666]">
                  {row}
                </td>
                {Array.from({ length: colCount }, (_, i) => (
                  <td key={i} className="h-[30px] border border-[#d4d4d4] bg-white" />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-end gap-0 border-t border-[#d0d0d0] bg-[#f3f3f3] px-2 pt-1">
        <div className="rounded-t border border-b-0 border-[#d0d0d0] bg-white px-3 py-1 text-[11px] font-medium text-[#217346]">
          Заявка
        </div>
        <div className="px-3 py-1 text-[11px] text-[#888]">+</div>
        <p className="ml-auto self-center pb-1 text-[10px] text-[#777]">
          Строка заголовков + одна строка данных
        </p>
      </div>
    </div>
  );
}

function MessagePreview({ config }: { config: BlankConfig }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-neutral-300 bg-white p-4 text-neutral-900 shadow-sm",
        "font-mono text-[13px] leading-relaxed",
      )}
    >
      <p className="mb-2 font-sans text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        Сообщение для копирования
      </p>
      <pre className="whitespace-pre-wrap font-inherit text-inherit">
        {renderTemplate(config.messageTemplate) || "—"}
      </pre>
    </div>
  );
}

/** Только превью — редактирование слева в настройках. */
export function BlankConstructorPreview({ config }: { config: BlankConfig }) {
  if (!config.format) {
    return <EmptyHint text="Выберите формат слева — здесь появится превью бланка" />;
  }
  switch (config.format) {
    case "word_table":
      return <WordTablePreview config={config} />;
    case "word_fax":
      return <WordFaxPreview config={config} />;
    case "excel":
      return <ExcelPreview config={config} />;
    case "message":
      return <MessagePreview config={config} />;
  }
}
