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
| `screenshots/` | **A layout check, not the store's pictures.** Made by `screenshots.mjs`, not committed: run Actions → [iOS build](https://github.com/jiesingian/My-Projects/actions/workflows/ios.yml) → Run workflow, tick "screenshots", then download the run's `app-store-screenshots` artifact. They are the QA test household on dev, whose names ("Dev Sample Household", "Quinn Tester", "E2E live chat") must not go on the store page. The store's screenshots come from a real iPhone in the review household (below). |

`check.mjs` counts each text block against Apple's limit and refuses the
words the listing must never use (prices, "Kin Plus", "subscribe",
"upgrade"; App Review 3.1.1). The iOS build check runs it on every change
here.

## The store's screenshots: from a real iPhone

After the first TestFlight install, sign in to the **review household**
(`review-notes.md`: invented names, a little sample life) and take them on
the iPhone (side button + volume up), never in your own family's household:
Today, the Planner, Chat, a person's health, an alarm ringing on the Lock
Screen, the incoming-call screen, a widget. A web page could not show the
last three at all.

Apple needs a set for the large slot (6.9": 1320 x 2868, a 16/17 Pro Max)
and one for the medium slot (6.3": 1206 x 2622, a 16/17 Pro). Both have the
same shape, so one phone's set can be scaled to the other size: a session
can do that from the files.
