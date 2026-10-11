import { useEffect, useState, type ReactElement } from 'react'
import { toast } from 'sonner'
import { ClipboardDocumentIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid'
import { Button } from '@/components/ui/button'

/** One copyable snippet: a labelled code block with a copy button. */
function Snippet({ id, label, code }: { id: string; label: string; code: string }): ReactElement {
  const copy = () =>
    navigator.clipboard.writeText(code).then(
      () => toast.success('Copied'),
      () => toast.error('Could not copy; select the text instead')
    )
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 id={`${id}-label`} className="text-sm font-medium text-foreground">
          {label}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => void copy()}
          aria-describedby={`${id}-label`}
        >
          <ClipboardDocumentIcon aria-hidden className="size-4" />
          Copy
        </Button>
      </div>
      <pre
        aria-labelledby={`${id}-label`}
        className="overflow-x-auto rounded-[var(--radius)] border border-border bg-muted/40 p-3 text-xs leading-relaxed text-foreground"
      >
        <code>{code}</code>
      </pre>
    </div>
  )
}

/**
 * How teams put the banner on an internal app (plans/v2/60 §4.7): copyable
 * snippets with this instance's address, the CSP entries their app needs, and
 * what to expect.
 */
export function AnnouncementInstallView({ embedEnabled }: { embedEnabled: boolean }): ReactElement {
  // The admin runs on the instance itself, so its origin is the address apps load from.
  const [origin, setOrigin] = useState('https://your-quackback.example')
  useEffect(() => setOrigin(window.location.origin), [])
  const script = `<script src="${origin}/api/fork-announcements/banner.js" defer></script>`

  return (
    <section aria-labelledby="announcement-install-heading" className="flex max-w-3xl flex-col">
      <div className="border-b border-border/50 px-3 py-3">
        <h2 id="announcement-install-heading" className="text-base font-semibold text-foreground">
          Install on an app
        </h2>
      </div>

      <div className="flex flex-col gap-6 px-3 py-4 text-sm text-foreground">
        {!embedEnabled ? (
          <div
            role="status"
            className="flex items-start gap-3 rounded-[var(--radius)] border border-warning/40 bg-warning/10 px-4 py-3"
          >
            <ExclamationTriangleIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
            <p>
              <span className="font-semibold">Embedded apps are off.</span> The script below does
              nothing until “Embedded apps” is turned on under Settings.
            </p>
          </div>
        ) : null}

        <p className="text-muted-foreground">
          Add one script tag to any internal app. It shows this workspace’s banners for everyone at
          the top of the page, in your Quackback theme, and updates within seconds when you publish,
          edit or archive one. Only banners whose “Show it in” includes “Apps that embed the banner”
          appear there.
        </p>

        <Snippet
          id="install-basic"
          label="1. Add the script (that is all most apps need)"
          code={script}
        />

        <Snippet
          id="install-placement"
          label="2. Optional: choose where the banners go"
          code={`<quackback-banner></quackback-banner>\n${script}`}
        />
        <p className="-mt-3 text-xs text-muted-foreground">
          Without the element, banners go at the top of the page. With it, they appear where you put
          it.
        </p>

        <Snippet
          id="install-csp"
          label="If your app has a Content Security Policy, allow this instance"
          code={`script-src ${origin};\nconnect-src ${origin};\nfont-src ${origin};`}
        />

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-foreground">Good to know</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
            <li>
              Embedded apps show banners whose audience is “Everyone”. Banners for specific segments
              stay in the portal for now.
            </li>
            <li>
              The banner’s requests carry no cookies. If an SSO proxy sits in front of this
              instance, it must let <code>/api/fork-announcements/*</code> through from your
              internal apps.
            </li>
            <li>
              Everyone can dismiss a banner; it stays hidden in that browser until the banner is
              edited.
            </li>
            <li>
              Apps cannot restyle the banner. It always uses your Quackback theme and the Inter
              font, served from this instance; the app’s CSS cannot reach it, and the portal’s
              custom CSS is not applied inside other apps.
            </li>
            <li>
              Browsers keep the script for up to five minutes, so updates to it arrive within that.
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
