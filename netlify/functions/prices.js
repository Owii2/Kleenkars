// netlify/functions/prices.js
import { neon } from '@netlify/neon';

const sql = neon(process.env.DATABASE_URL);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

function checkAdmin(event){
  const auth = (event.headers.authorization || '').replace('Bearer ', '').trim();
  return !!(ADMIN_TOKEN && auth === ADMIN_TOKEN);
}

function normalizeRow(row){
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    prices: {
      bike: row.bike === null ? null : Number(row.bike),
      hatchback: row.hatchback === null ? null : Number(row.hatchback),
      sedan: row.sedan === null ? null : Number(row.sedan),
      suv: row.suv === null ? null : Number(row.suv)
    },
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/* Map kleenkars_services row -> package shape */
function mapServiceRowToPackage(row){
  return {
    id: String(row.name),
    name: row.name,
    description: row.description || '',
    prices: {
      bike: row.bike == null ? null : Number(row.bike),
      // if you later add hatchback column to kleenkars_services, change this line
      hatchback: (row.hatchback !== undefined && row.hatchback !== null) ? Number(row.hatchback) : (row.sedan == null ? null : Number(row.sedan)),
      sedan: row.sedan == null ? null : Number(row.sedan),
      suv: row.suv == null ? null : Number(row.suv)
    },
    created_at: row.updated_at || null,
    updated_at: row.updated_at || null
  };
}

export const handler = async (event) => {
  try {
    const method = event.httpMethod;
    const q = event.queryStringParameters || {};
    const tableParam = (q.table || '').toLowerCase();
    const isAlacarte = tableParam === 'alacarte';

    // GET: public
    if (method === 'GET') {
      // If client requested specific table (packages/alacarte), return those Neon tables as before
      if (tableParam) {
        if (isAlacarte) {
          const rows = await sql`SELECT * FROM alacarte ORDER BY created_at ASC`;
          return { statusCode: 200, body: JSON.stringify({ alacarte: rows.map(normalizeRow) }) };
        } else {
          const rows = await sql`SELECT * FROM packages ORDER BY created_at ASC`;
          // If you want to prefer services even when table=packages is explicitly requested, change this behavior.
          return { statusCode: 200, body: JSON.stringify({ packages: rows.map(normalizeRow) }) };
        }
      }

      // No table param -> return packages from kleenkars_services (visible) and alacarte from alacarte table
      let packages = [];
      try {
        const svcRows = await sql`
          SELECT name, bike, sedan, suv, position, visible, description, updated_at
          FROM kleenkars_services
          WHERE visible = TRUE
          ORDER BY position ASC, name ASC
        `;
        if (Array.isArray(svcRows) && svcRows.length > 0) {
          packages = svcRows.map(mapServiceRowToPackage);
        }
      } catch (e) {
        console.warn('prices: reading kleenkars_services failed', e);
        // fallback: leave packages empty
      }

      // still populate alacarte from table if present
      let alacarte = [];
      try {
        const al = await sql`SELECT * FROM alacarte ORDER BY created_at ASC`;
        alacarte = al.map(normalizeRow);
      } catch (e) {
        console.warn('prices: reading alacarte failed', e);
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ packages, alacarte })
      };
    }

    // modifying endpoints require admin token
    if (!checkAdmin(event)) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    // POST -> create (same as before)
    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      if (!body.name) return { statusCode: 400, body: JSON.stringify({ error: 'name required' }) };
      const p = body.prices || {};

      if (isAlacarte) {
        const [row] = await sql`
          INSERT INTO alacarte (name, description, bike, hatchback, sedan, suv)
          VALUES (${body.name}, ${body.description || null}, ${p.bike ?? null}, ${p.hatchback ?? null}, ${p.sedan ?? null}, ${p.suv ?? null})
          RETURNING *;
        `;
        return { statusCode: 201, body: JSON.stringify(normalizeRow(row)) };
      } else {
        const [row] = await sql`
          INSERT INTO packages (name, description, bike, hatchback, sedan, suv)
          VALUES (${body.name}, ${body.description || null}, ${p.bike ?? null}, ${p.hatchback ?? null}, ${p.sedan ?? null}, ${p.suv ?? null})
          RETURNING *;
        `;
        return { statusCode: 201, body: JSON.stringify(normalizeRow(row)) };
      }
    }

    // PUT/PATCH -> update by id (same as before)
    if (method === 'PUT' || method === 'PATCH') {
      const id = q.id;
      if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing id' }) };
      const body = JSON.parse(event.body || '{}');

      if (isAlacarte) {
        const [existing] = await sql`SELECT * FROM alacarte WHERE id = ${id}`;
        if (!existing) return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
        const name = body.name ?? existing.name;
        const description = body.description ?? existing.description;
        const prices = body.prices || {};
        const bike = prices.bike ?? existing.bike;
        const hatchback = prices.hatchback ?? existing.hatchback;
        const sedan = prices.sedan ?? existing.sedan;
        const suv = prices.suv ?? existing.suv;

        const [row] = await sql`
          UPDATE alacarte
          SET name = ${name}, description = ${description}, bike = ${bike}, hatchback = ${hatchback}, sedan = ${sedan}, suv = ${suv}, updated_at = now()
          WHERE id = ${id}
          RETURNING *;
        `;
        return { statusCode: 200, body: JSON.stringify(normalizeRow(row)) };
      } else {
        const [existing] = await sql`SELECT * FROM packages WHERE id = ${id}`;
        if (!existing) return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
        const name = body.name ?? existing.name;
        const description = body.description ?? existing.description;
        const prices = body.prices || {};
        const bike = prices.bike ?? existing.bike;
        const hatchback = prices.hatchback ?? existing.hatchback;
        const sedan = prices.sedan ?? existing.sedan;
        const suv = prices.suv ?? existing.suv;

        const [row] = await sql`
          UPDATE packages
          SET name = ${name}, description = ${description}, bike = ${bike}, hatchback = ${hatchback}, sedan = ${sedan}, suv = ${suv}, updated_at = now()
          WHERE id = ${id}
          RETURNING *;
        `;
        return { statusCode: 200, body: JSON.stringify(normalizeRow(row)) };
      }
    }

    // DELETE -> same as before
    if (method === 'DELETE') {
      const id = q.id;
      if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing id' }) };

      if (isAlacarte) {
        const [res] = await sql`DELETE FROM alacarte WHERE id = ${id} RETURNING id`;
        if (!res) return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
        return { statusCode: 200, body: JSON.stringify({ success: true, id: res.id }) };
      } else {
        const [res] = await sql`DELETE FROM packages WHERE id = ${id} RETURNING id`;
        if (!res) return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
        return { statusCode: 200, body: JSON.stringify({ success: true, id: res.id }) };
      }
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('prices function error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Server error' }) };
  }
};
