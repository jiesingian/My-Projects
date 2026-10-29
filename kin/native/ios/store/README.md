# The App Store listing, ready to paste

Everything App Store Connect asks for before Kin's first review, written out
so the day the Apple Developer Program is paid for, the listing is copy and
paste. SETUP_FOR_JONATHAN.md §9 says when each one is used.

| File | Where it goes in App Store Connect |
|---|---|
| `listing.md` | App Information (name, subtitle, category) and the 1.0 version page (promotional text, description, keywords, what's new, URLs, copyright, price) |
| `review-notes.md` | The version page's App Review Information: the review account you create, its sign-in, and the notes |
| `privacy.md` | App Privacy: the data-type answers and the privacy policy URL |
| `age-rating.md` | App Information → Age Rating: every answer and why |
| `screenshots/` | The version page's iPhone screenshots. Made by `screenshots.mjs`, not committed: run Actions → [iOS build](https://github.com/jiesingian/My-Projects/actions/workflows/ios.yml) → Run workflow, tick "screenshots", then download the run's `app-store-screenshots` artifact. `6.9-inch/` goes in the 6.9" slot and `6.3-inch/` in the 6.3" slot, in file order. |

`check.mjs` counts each text block against Apple's limit and refuses the
words the listing must never use (prices, "Kin Plus", "subscribe",
"upgrade"; App Review 3.1.1). The iOS build check runs it on every change
here.

## What the screenshots can't show

A web page can't show the native parts: an alarm ringing on the Lock Screen,
the incoming-call screen, a widget. Up to ten screenshots are allowed per
size, so after the first TestFlight install, take those three on a real
iPhone (side button + volume up) in the **sample review household**, never
your own family's, and add them in front. A 6.9" iPhone (16/17 Pro Max)
gives 1320 x 2868 pixels; a 6.3" one (16/17 Pro) gives 1206 x 2622.
