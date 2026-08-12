# Bunk Ledger

A single-page attendance calculator: enter a weekly timetable, the working days and the
term dates, and it works out how many classes you may still miss in each subject — and how
many whole days off that adds up to — while staying at or above a minimum attendance rule
(80% by default).

Not part of the Loom product. It is a standalone project that happens to live in this
repo; nothing here imports from `app/`, and nothing in `app/` imports from here.

## Running it

Open `index.html` in a browser. No build, no server, no dependencies, no network calls.
Entries are kept in `localStorage`, so the page remembers a timetable between visits.

## Getting your numbers in

The calculator never contacts `attendance.iiitkottayam.ac.in`. It has no credentials and
makes no network calls at all — pulling your live attendance would mean handing it your
login, which is not something this page asks for or wants.

Instead, copy the attendance table out of the portal and paste it into the import box. The
parser is deliberately format-agnostic, because portals differ and this one has not been
inspected. It reads:

- tab-separated pastes straight from an HTML table (what a browser copy produces),
  pipe- or comma-separated text, aligned columns, and plain lines like
  `CS2001 Data Structures 32 28 87.5%`
- a header row when there is one, mapping columns by their names — held/total/conducted,
  attended/present, absent, percentage — and positional numbers when there isn't
- `28/32` pairs, present+absent instead of a total, and a percentage in place of a
  missing attended count

Anything it infers is labelled, and every parsed row is previewed with the subject it will
update before you commit the import. Check it against the portal — a misread column is the
one failure mode worth catching by eye.

The bundled bookmarklet automates the copying step. Clicked on the portal's attendance
page, it serialises every table there and reopens the calculator with the rows already in
the import box. The data travels in the URL fragment — the part after `#`, which browsers
do not send to servers — and the page strips it from the address bar on arrival so
attendance figures do not linger in history. If the browser blocks the new tab, it copies
the rows to the clipboard instead.

The bookmarklet reads the rendered DOM, so it works whether the portal is server-rendered
or draws its table from an internal JSON call. It runs on the portal's own origin under
your existing session; the calculator itself never makes a network request.

## What it computes

For each subject, over the whole term:

```
total     = classes already held + every remaining slot in the timetable
required  = ceil(total × threshold)
allowed   = total − required          # absences the rule permits
bunksLeft = allowed − already missed
```

Remaining slots come from real dates: every day between today and the end of term that is
a working weekday, is not listed as a holiday, and has at least one class on it.

The headline "whole days you can skip" figure is a greedy plan over those actual days. It
takes one day off at a time, always the day that costs least relative to how little room
each subject has left, and stops before any subject would fall under the line. So it
respects per-subject limits rather than just the aggregate percentage — a two-period lab
that meets once a week runs out of slack long before the rest of the timetable does. The
result is one safe plan; other combinations of the same size may exist.

A subject that cannot reach the threshold even by attending every remaining class is
flagged separately, with the best percentage still achievable.

## Layout note

This is deliberately one self-contained file rather than following the repo's 400-line
limit, which applies to Loom's own source. The point of the tool is that the single file
can be opened from a phone, a USB stick or a static host with nothing else around it.
