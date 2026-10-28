# Draft letters to IMD and CWC (not sent)

Drafts only: nothing has been sent, and you decide whether to send any of them (the data is public and the app reads it like any web page; `docs/FIELD_ALERTS.md`, "Decisions of the owner"). Fill the square brackets, and send from an address that can receive a reply. Written 28 Oct 2026. Hindi versions on request.

## 1. A question to IMD about the district warnings (settles the open point "what is Day_1")

**To:** the contact of the IMD district-wise warning page (mausam.imd.gov.in, "Contact" or the GIS warning page's feedback address) and, if you find it, the Agromet or Nowcast division.
**Subject:** Question: meaning of Day_1 in the district-wise warning layer `district_warnings_india`

> Respected Sir/Madam,
>
> I am [name], a [student / member of a small team] building PlantGuard, a free, non-commercial web application that shows farmers the weather warnings for their district. It reads the district-wise warning layer published on your site (`imd:district_warnings_india` on reactjs.imd.gov.in) and shows each warning exactly as IMD publishes it, with the source named and a link to your page. We add no advice to your warnings.
>
> We would like to be sure we read one thing correctly. In that layer each district has `Day_1` to `Day_5` colours and hazard codes, and an `updated_at` time. We read **Day_1 as the day on which the layer was updated** (today in India), Day_2 as tomorrow, and so on, because the warning map on your page shows the warnings in that order. Is that the correct meaning? And is `updated_at` in Indian Standard Time?
>
> Two smaller questions: (1) Is there a document that lists the hazard codes (we use the legend on your page: 2 heavy rain, 4 thunderstorm and lightning, 9 heat wave, 12 cold wave and so on)? (2) Is this layer meant to be read by other websites and applications, and if so, is there a preferred way or address, or a limit on how often it may be fetched? We fetch it at most once every 30 minutes for the whole country, and never per user.
>
> If you would rather that we did not use it, please tell us and we will switch it off at once.
>
> Thank you,
> [name], [address / institution], [email], [phone]

## 2. A courtesy note to IMD and to CWC before a wide public launch (optional)

**To:** IMD (as above) and CWC's flood-forecasting contact (ffs.india-water.gov.in).
**Subject:** Notice of use: free farmer-facing application that shows your public data with attribution

> Respected Sir/Madam,
>
> This is to let you know, and to ask for any objection or guidance, that **PlantGuard** (non-commercial; [link]) shows farmers, for the fields they save, [IMD: the district warnings of IMD / CWC: whether the nearest CWC river gauge is above its warning level, from the public lists your flood-forecasting site shows on its own page].
>
> What we do: our server fetches these public lists at most every 30 minutes for the whole country (never once per user), keeps the latest copy, and shows the result with "Source: IMD" or "Source: CWC", the time of issue, and a link to your page. We do not change the content, we add no advice to it, and for the river gauge we say "the nearest gauge, about N km away" and never that a field will flood. A farmer's exact field location is never sent to you or shown anywhere; only the district or a distance rounded to 5 km is used.
>
> We do not republish your data in bulk and we have a switch to stop reading a source at once. If you would like us to stop, change how we fetch, or show a particular acknowledgement, please tell us and we will do so.
>
> Thank you for the public service these pages provide.
>
> [name], [address / institution], [email], [phone]

## 3. A note to IMD about the empty state bulletin files (optional, one paragraph)

> While building a link to your state agromet bulletins we found that on 26 Oct 2026 the per-state PDF files such as `.../agromet-data/state/current/english-pdf/Punjab.pdf` returned an empty file (0 bytes, last modified 8 Oct 2025), although the matching `.../english-png/Punjab.png` file opened normally, and the national bulletin PDF was fine. We thought you would want to know.

## 4. Where these are used
Letter 1 answers the open item "IMD's meaning of Day_1" in `task.md`; letters 2 and 3 are the optional items in the same list. The app's wording for Day_1 is in `docs/FIELD_ALERTS.md`, section 7.
