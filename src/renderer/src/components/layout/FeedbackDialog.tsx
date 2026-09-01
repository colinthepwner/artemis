import { useId, useState } from 'react'
import { motion } from 'framer-motion'
import { Bug, Lightbulb, MessageSquare, Send, X } from 'lucide-react'
import type { FeedbackKind } from '@shared/ipc'
import { useAppStore } from '@/store/appStore'
import { useCloseOnEscape } from '@/components/ui/dismissDistant'
import { cn } from '@/lib/cn'

const MIN_LENGTH = 15

const TABS: { kind: FeedbackKind; label: string; icon: typeof Bug; placeholder: string }[] = [
  {
    kind: 'suggestion',
    label: 'Suggestion',
    icon: Lightbulb,
    placeholder: 'A thing you wish existed, or worked differently…'
  },
  {
    kind: 'bug',
    label: 'Bug report',
    icon: Bug,
    placeholder: 'What you did, what you expected, and what happened instead…'
  }
]

export function FeedbackDialog(): JSX.Element | null {
  const open = useAppStore((s) => s.feedbackOpen)
  const setOpen = useAppStore((s) => s.setFeedbackOpen)
  const [tab, setTab] = useState<FeedbackKind>('suggestion')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<
    'idle' | 'sending' | 'sent' | 'failed' | 'duplicate' | 'spam'
  >('idle')

  const pill = useId()

  useCloseOnEscape(
    () => setOpen(false),
    () => !open
  )

  if (!open) return null

  const active = TABS.find((t) => t.kind === tab) ?? TABS[0]
  const text = drafts[active.kind] ?? ''
  const tooShort = text.trim().length < MIN_LENGTH

  const settled = status === 'sent' || status === 'duplicate'

  const close = (): void => {
    setOpen(false)
    if (settled) setDrafts((d) => ({ ...d, [active.kind]: '' }))
    setStatus('idle')
  }

  const pickTab = (kind: FeedbackKind): void => {
    if (settled) setDrafts((d) => ({ ...d, [active.kind]: '' }))
    setTab(kind)
    setStatus('idle')
  }

  const send = async (): Promise<void> => {
    if (tooShort || status === 'sending') return
    setStatus('sending')

    const result = await window.artemis.feedback
      ?.send(active.kind, text.trim())
      .catch(() => ({ ok: false as const, reason: 'network' as const }))
    if (result?.ok) setStatus('sent')
    else if (result?.reason === 'duplicate') setStatus('duplicate')
    else if (result?.reason === 'tooFast') setStatus('spam')
    else setStatus('failed')
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <motion.div
        className="acrylic absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.12 }}
        onClick={close}
      />
      <motion.div
        className="relative flex w-[460px] flex-col overflow-hidden rounded-xl bg-ink-850 shadow-raised"
        initial={{ opacity: 0, scale: 0.97, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-start gap-2.5 border-b border-white/[0.04] px-5 py-3.5">
          <MessageSquare size={15} className="mt-0.5 text-gold-400" />
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold tracking-tight">Send feedback</h2>
            <p className="mt-0.5 text-2xs text-mist-500">Goes straight to Colin.</p>
          </div>
          <div className="flex-1" />
          <button
            onClick={close}
            className="rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-5">
          <div className="flex gap-1 rounded-md bg-ink-900/70 p-0.5 shadow-panel">
            {TABS.map((t) => {
              const on = t.kind === tab
              return (
                <button
                  key={t.kind}
                  onClick={() => pickTab(t.kind)}
                  className={cn(
                    'relative flex flex-1 items-center justify-center rounded px-2 py-1.5 text-2xs font-semibold transition-colors duration-100',
                    on ? 'z-10 text-gold-400' : 'text-mist-500 hover:text-mist-300'
                  )}
                >
                  {

}
                  {on && (
                    <motion.span
                      layoutId={pill}
                      className="absolute inset-0 rounded bg-ink-750 shadow-panel"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <t.icon size={13} /> {t.label}
                  </span>
                </button>
              )
            })}
          </div>

          {settled ? (
            <p className="rounded-md bg-gold-500/10 px-3 py-2.5 text-xs leading-relaxed text-gold-400">
              {status === 'sent'
                ? 'Sent. Thank you, it genuinely helps.'
                : 'This one has already been sent, so it is in good hands. Once was plenty.'}
            </p>
          ) : (
            <>
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setDrafts((d) => ({ ...d, [active.kind]: e.target.value }))}
                maxLength={4000}
                rows={6}
                placeholder={active.placeholder}
                className="input-base resize-none leading-relaxed"
              />
              {status === 'failed' && (
                <p className="text-2xs leading-relaxed text-ember-400/90">
                  That did not go through. Check the connection and try again; the note is kept.
                </p>
              )}
              {status === 'spam' && (
                <p className="rounded-md bg-ink-900/70 px-3 py-2 text-2xs leading-relaxed text-mist-300">
                  Kindly, easy on the send button: repeats and rapid fire land nowhere, they are
                  simply dropped. Take a breather and send it once in a little while.
                </p>
              )}
              {status !== 'spam' && text.trim().length > 0 && tooShort && (
                <p className="text-2xs text-mist-600">
                  A few more words, please: at least {MIN_LENGTH} characters.
                </p>
              )}
            </>
          )}

          <div className="flex items-center gap-2">
            <p className="text-2xs text-mist-600">Sends the note, the app version, nothing else.</p>
            <div className="flex-1" />
            {settled ? (
              <button
                onClick={close}
                className="rounded-md bg-ink-750 px-3 py-1.5 text-2xs font-semibold text-mist-200 transition-colors hover:bg-ink-700"
              >
                Close
              </button>
            ) : (
              <button
                onClick={() => void send()}
                disabled={tooShort || status === 'sending'}
                className={cn(
                  'flex items-center gap-1.5 rounded-md bg-gold-500 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-950 transition-all',
                  tooShort || status === 'sending'
                    ? 'cursor-not-allowed opacity-40'
                    : 'hover:bg-gold-400 active:scale-[0.97]'
                )}
              >
                <Send size={12} /> {status === 'sending' ? 'Sending…' : 'Send'}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
