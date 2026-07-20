# Dish Photos — how they work now, and how they'll work with a database

## Where things stand today

Your six real dish photos are in the app in **two** places:

1. **Inlined in the code** as small thumbnails (320px, ~130 KB total) — this is why
   photos appear immediately, even in a preview with no server.
2. **As real files** in `public/menu/` (800px, 65–122 KB each) — these ship with the
   site and are served from `https://yourdomain.com/menu/chicken-momos.jpg`.

Both are temporary arrangements. Once the database is live, photos should come from
**one** place: a link stored against each dish.

---

## The rule: store the *link*, not the image

A common mistake is saving the image itself into the database (as base64 or a BLOB).
Don't. It makes the database many times larger, slows every menu query, makes backups
painful, and prevents the browser from caching images.

**Do this instead:**

```
   Photo file  →  file storage (S3 / Cloudinary / Supabase Storage)
                          ↓
                  returns a URL
                          ↓
   Database stores only:  photoUrl = "https://cdn.../momos.jpg"
```

The database row stays tiny. The image is served by a CDN, which is faster and cheaper
than serving it from your own server.

Your Prisma schema already has the field:

```prisma
model MenuItem {
  id        String  @id @default(cuid())
  name      String
  price     Int
  category  String
  photoUrl  String?      // ← the link, nothing else
  branchIds String[]
  available Boolean @default(true)
}
```

---

## Which storage service to pick

| Option | Free tier | Best for | Notes |
|---|---|---|---|
| **Cloudinary** | 25 GB/month | **Recommended for you** | Resizes and compresses automatically; a bad phone photo still loads fast |
| **Supabase Storage** | 1 GB | If you use Supabase for the database anyway | One dashboard for everything |
| **AWS S3 + CloudFront** | 5 GB (12 months) | Large scale | Most powerful, most setup |
| **Your own server** | — | Not recommended | You handle backups, scaling and CDN yourself |

For two branches and a menu of 30–50 dishes, **Cloudinary's free tier is more than
enough** and needs the least work.

---

## The upload flow, end to end

The admin already has the field for this — **Menu → Add item → "…or paste a photo URL"**.
When the backend exists, the flow becomes:

1. Admin picks a photo in the Menu screen.
2. The browser asks your server for a short-lived upload permission (a *signed URL*).
   The storage account's secret key stays on the server and is never sent to the browser.
3. The browser uploads the file straight to Cloudinary/S3 — it never passes through
   your server, so your server stays fast.
4. Storage returns the final URL.
5. Your server saves that URL in `MenuItem.photoUrl`.
6. Every customer's menu now shows the new photo.

Backend sketch (Express, already matching the scaffold's style):

```js
// POST /api/menu/:id/photo-url  →  give the browser a one-time upload permission
router.post("/menu/:id/photo-url",
  authenticate, authorize("admin", "manager"),
  async (req, res) => {
    const signed = cloudinary.utils.api_sign_request(
      { folder: "hunza-menu", timestamp: Math.round(Date.now() / 1000) },
      process.env.CLOUDINARY_SECRET            // stays on the server
    );
    res.json(signed);
  });

// PATCH /api/menu/:id  →  save the returned URL
router.patch("/menu/:id",
  authenticate, authorize("admin", "manager"),
  validate(menuPatchSchema),                    // photoUrl must be a valid https URL
  async (req, res) => {
    const item = await prisma.menuItem.update({
      where: { id: req.params.id },
      data: { photoUrl: req.body.photoUrl },
    });
    res.json(item);
  });
```

Front-end change needed (small): the menu list currently reads `it.img`. Point it at
`it.photoUrl` coming from the API, and delete the inlined `IMG_*` constants.

---

## Rules worth enforcing on the server

- **Validate the URL** — only `https://` links, and ideally only from your own storage
  domain. Otherwise someone could point a dish at any image on the internet.
- **Cap the file size** — reject anything over ~5 MB. Phone photos are often 4–8 MB.
- **Accept only images** — check the actual file type, not just the file name.
- **Only admin and manager** may change photos (the scaffold's `authorize` already does this).
- **Resize on upload** — a 4 MB photo costs your customers real mobile data. Cloudinary
  can do this automatically; ask it for an 800px version.

---

## Practical tips for your own photos

- Shoot in **landscape or square**, with the dish centred — the app crops to a square.
- Natural light near a window beats the restaurant's ceiling lights.
- Keep the background plain; the plate should fill most of the frame.
- Around **800×800 pixels** is plenty. Bigger just costs your customers data.
- Use the same angle for every dish — the menu looks much more professional.

---

## What to do right now

Nothing urgent. The current setup works and looks right. When the backend goes live:

1. Create a free Cloudinary account.
2. Upload the six photos there (or better ones, shot with the tips above).
3. Paste each URL into **Menu → Edit → Photo URL**.
4. Remove the inlined `IMG_*` constants from `App.jsx` — the file will shrink by ~130 KB.

Until then, the photos travelling inside the app are perfectly fine for demos,
client presentations and staff training.
