# Reservas Estoril: setup and day-to-day guide

## How it fits together

```
Airbnb / Booking.com / site emails ──► Gmail ──► Apps Script (every 10 min) ──► Google Sheet "Reservas Estoril · dados"
                                                        ▲
                         index.html (GitHub Pages) ─────┘  asks for data only with the Manager or Cleaning password
```

- **index.html + parser.js**: your page. It holds no booking data, so it can stay on public GitHub Pages.
- **Code.gs + Parser.gs**: the server, in your own Google account. It reads Gmail, stores bookings in a Google Sheet and checks passwords.
- **parser.js and Parser.gs are the same file.** If you ever change one, paste the change into the other.

## 1. Choose the Gmail account

The script runs in the Gmail account that *receives* the booking emails. There are two ways to do this.

- **A. Run it in Miguel's Gmail** (miguel.m.mascarenhas@gmail.com). This is the simplest: nothing needs forwarding.
- **B. Run it in your own Gmail** and have Miguel's Gmail forward the emails to you automatically:
  1. In Miguel's Gmail, go to Settings → *Forwarding and POP/IMAP* → *Add a forwarding address*.
  2. Enter your address. Google sends a confirmation code to your inbox; enter it.
  3. Go to Settings → *Filters* → *Create filter*. In **From** put `airbnb.com OR booking.com OR brevosend.com`.
  4. Choose *Create filter* → *Forward it to* your address.

Emails you forward by hand (*Forward* in Gmail) are read too, including several forwards in one email.

## 2. Create the script (about 15 minutes, once)

1. Sign in to the chosen Gmail account and open **https://script.google.com** → **New project**. Rename it to "Reservas Estoril".
2. Delete what is in `Code.gs` and paste in all of **Code.gs**.
3. Click **+** next to *Files* → **Script**, name it `Parser`, and paste in all of **parser.js**. Press **Save**.
4. In the function menu at the top, choose **setup** and press **Run**.
   - Google asks for permission to read Gmail and use Sheets. Choose your account, then *Advanced* → *Go to Reservas Estoril (unsafe)* → *Allow*.
   - The "unsafe" warning appears because this is your own unpublished script. Only you can run it.
   - setup creates the Google Sheet and starts a check every 10 minutes. The *Execution log* shows the sheet's link.
5. Open `setPasswords` in Code.gs and type two passwords between the quotes:
   - `MANAGER` for you;
   - `CLEANING` for the cleaning team.

   Each needs at least 8 characters, and the two must be different. Choose **setPasswords** in the menu and press **Run**. Then **delete the two passwords from the code and save**. Only a scrambled version (a hash) is kept.
6. Choose **importHistory** → **Run**. This reads the last 400 days of booking emails.
   - If it stops at the 6-minute limit, run it again; it continues where it stopped.
7. Choose **Deploy → New deployment** → the gear icon → **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**

   Then **Deploy** and copy the **Web app URL** (it ends in `/exec`).
   - "Anyone" only means the page can reach the script. Without a correct password the script returns nothing.

## 3. Connect the page

1. Put `index.html` and `parser.js` side by side in your GitHub Pages repository. They replace the old page.
2. Open `index.html`, search for `const API_URL=''` and paste the Web app URL between the quotes. Commit.
   - Alternatively, leave it empty and paste the URL on each device, in the login box under *Server address* or in Settings → *Server & access*.
3. Open the page, enter the manager password, and the **Emails** tab fills in.

**Updating the script later:** after you change Code.gs or Parser.gs, use **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. The URL stays the same.

## 4. Using it

| Task | Where |
|---|---|
| See new bookings, inquiries, what needs attention | **Emails** tab |
| Read Gmail right now instead of waiting up to 10 min | **Check Gmail now** (top bar) |
| Fix a name, date, apartment, total or profit | Change it in the Emails table; it saves at once and later emails won't overwrite it |
| Booking.com email has no apartment | Pick it in the *Apt* column (Booking.com uses one property name for all three flats) |
| Airbnb listing always the same flat | Emails → *Listing names → apartment* (set once) |
| Add a phone or walk-in booking | Import → *Add a guest manually* (also saved on the server) |
| A booking email that never reached Gmail | Emails → *Paste an email* → Read → Save |
| Copy bookings into the Excel workbook | Import → load the workbook → *Create updated workbook* |
| Analysis | **Dashboard**: workbook history plus email bookings not yet in it |
| Cleaning team | They log in with the cleaning password and see only Calendar and Lavandaria |

## What the emails give you

| Email | Read automatically |
|---|---|
| Airbnb *Reserva confirmada* / *Lembrete de reserva* | Name, country, listing, dates and times, guests, code, total paid by guest, host fee, **your payout (profit)** |
| Airbnb *Enviámos-lhe um pagamento* | Actual payout per booking (replaces the estimate) |
| Airbnb *Consulta* / *Pré-aprovação* | Saved as an **Inquiry** with the guest's message; not in the calendar |
| Airbnb review emails | Ignored |
| Booking.com guest messages | Name, dates, guests, booking number, message. A requested check-in time ("check-in às 17:00") becomes the check-in time |
| Booking.com cancellations | Status changes to Cancelled; the stay leaves the calendar |
| Site (*New room booking request*) | Name, phone, email, apartment, adults/children, dates, time, notes, code. Status *Waiting Confirmation* |

Things to fill in by hand:
- **Booking.com totals**: these emails don't contain the price. Type it in, or load the Booking export on the Import tab.
- **Site totals**: the site's €40 is the cleaning fee only. Correct it once the price is agreed.

Profit is the Airbnb payout when known. Otherwise it is estimated from the total, minus commission and (for Booking) tourist tax, using the rates in the workbook's *Dashboard update* sheet.

## Security notes

- Passwords are never stored in plain text.
- Each login lasts 8 hours (and the page still clears itself after 30 minutes idle).
- After 8 wrong attempts, logins are blocked for 15 minutes.
- The cleaning login never receives surnames, phones, emails, prices or notes.
- The Google Sheet is private to the Google account that ran setup. Don't share it.
- To lock everyone out at once, run `setPasswords` with new passwords.

## If something goes wrong

- **"Wrong password" for the right password**: run setPasswords again; check you saved after typing.
- **Nothing appears**: open the Google Sheet → *Log* tab. Every email read is listed with what was found ("saved" / "ignored").
- **The page says the server didn't answer correctly**: the deployment must be *Web app*, *Execute as Me*, *Anyone*. The URL must end in `/exec`, not `/dev`.
- **An email type is not recognised** (for example a Booking.com format not seen yet): paste it in Emails → *Paste an email*. If it reads nothing, send it over and the parser can be extended.
