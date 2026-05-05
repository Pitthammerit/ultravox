export const ok = (c, data = {}) => c.json({ ok: true, ...data });
export const fail = (c, error, status = 400, extra = {}) => c.json({ ok: false, error, ...extra }, status);
