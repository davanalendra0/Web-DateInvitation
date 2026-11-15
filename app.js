const $ = s => document.querySelector(s);

const esc = s => String(s).replace(/[&<>"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
}[c]));

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* IndexedDB (privat di browser ini) */
let dbp = new Promise((res, rej) => {
    try {
        const r = indexedDB.open('tiket-date', 1);

        r.onupgradeneeded = () => {
        r.result.createObjectStore('tickets', { keyPath: 'id' });
        r.result.createObjectStore('media', { keyPath: 'id' });
        };

        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    } catch (e) {
        rej(e);
    }
});

const mem = {
    tickets: [],
    media: []
};

async function tx(store, mode, fn) {
    try {
        const d = await dbp;

        return await new Promise((res, rej) => {
        const t = d.transaction(store, mode);
        const s = t.objectStore(store);
        const r = fn(s);

        t.oncomplete = () => res(r && r.result);
        t.onerror = () => rej(t.error);
        });
    } catch (e) {
        return null;
    }
}

/* Firebase: tiket disimpan di Firestore */
const fb = (async () => {
    const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
    const [{ initializeApp }, fs] = await Promise.all([
        import(base + 'firebase-app.js'),
        import(base + 'firebase-firestore.js')
    ]);
    return { db: fs.getFirestore(initializeApp(firebaseConfig)), fs };
})();

const COL = 'dateTickets';

addEventListener('unhandledrejection', e => {
    alert('Firebase bermasalah: ' + ((e.reason && e.reason.code) || e.reason));
});

const all = async st => {
    if (st === 'tickets') {
        const { db, fs } = await fb;
        return (await fs.getDocs(fs.collection(db, COL))).docs.map(d => d.data());
    }
    return (await tx(st, 'readonly', s => s.getAll())) || mem[st];
};

const one = async id => {
    const { db, fs } = await fb;
    const d = await fs.getDoc(fs.doc(db, COL, id));
    return d.exists() ? d.data() : null;
};

const put = async (st, o) => {
    if (st === 'tickets') {
        const { db, fs } = await fb;
        await fs.setDoc(fs.doc(db, COL, o.id), o);
        return;
    }
    if ((await tx(st, 'readwrite', s => s.put(o))) === null) mem[st].push(o);
};

const del = async (st, id) => {
    if (st === 'tickets') {
        const { db, fs } = await fb;
        await fs.deleteDoc(fs.doc(db, COL, id));
        return;
    }
    await tx(st, 'readwrite', s => s.delete(id));
    mem[st] = mem[st].filter(x => x.id !== id);
};

const fmtDate = d => d
    ? new Date(d + 'T00:00').toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
        })
    : 'Tanggal belum diisi';

function ticketHTML(t) {
    const d = t.date ? new Date(t.date + 'T00:00') : null;

    return `<div class="ticket"><div class="tk-main"><p class="tk-inv">${esc('kamu diundang untuk')}</p><h3 class="tk-title">${esc(t.title || '…')}</h3>
    <div class="tk-when">${esc(cap(fmtDate(t.date)))}, pukul ${esc(t.time || '--:--')}</div>
    ${t.notes ? `<p class="tk-notes">${esc(t.notes)}</p>` : ''}<div class="tk-by">${t.by?'by '+esc(t.by):'by …'}</div></div>
    <div class="tk-stub"><b>${d ? d.getDate() : '--'}</b><span>${d ? d.toLocaleDateString('id-ID', { month: 'short' }) : ''}</span><i>${esc(t.time || '')}</i></div></div>`;
}

const linkOf = t => new URL('tiket.html?id=' + t.id, location.href).href;

if (document.body.dataset.page === 'index') {
    const cur = () => ({
        by: $('#by').value,
        title: $('#title').value.trim(),
        date: $('#date').value,
        time: $('#time').value,
        notes: $('#notes').value.trim()
    });

    const draw = () => {
        $('#preview').innerHTML = ticketHTML(cur());
    };

    $('#f').addEventListener('input', draw);

  /* tab */
    function show(n) {
        document.querySelectorAll('nav button').forEach(b => b.setAttribute('aria-selected', b.dataset.t === n));

        ['buat', 'riwayat'].forEach(s => $('#'+s).hidden = s !== n);

        if (n === 'riwayat') renderHist();
    }

    document.querySelectorAll('nav button').forEach(b => b.onclick = () => show(b.dataset.t));

  /* simpan */
    $('#f').addEventListener('submit', async e => {
        e.preventDefault();

        const t = {
            id: 't' + Date.now(),
            at: Date.now(),
            ...cur()
        };

        await put('tickets', t);

        $('#f').reset();
        draw();
        show('riwayat');

        const first = $('#hist .ticket');
        if (first) first.classList.add('pop');
    });

    /* share */
    function wrap(c, txt, x, y, w, lh) {
        let l = '';

        for (const word of txt.split(' ')) {
        const n = l + word + ' ';

        if (c.measureText(n).width > w && l) {
            c.fillText(l, x, y);
            y += lh;
            l = word + ' ';
        } else {
            l = n;
        }
        }

        c.fillText(l, x, y);
        return y + lh;
    }

    async function share(t) {
        const text = `${cap('kamu diundang untuk')} ${t.title}\n${cap(fmtDate(t.date))}, pukul ${t.time}\n${t.notes ? t.notes + '\n' : ''}by ${t.by}\n${linkOf(t)}`;

        try {
            const c = document.createElement('canvas');
            c.width = 1080;
            c.height = 1350;

            const x = c.getContext('2d');

            x.fillStyle = '#1d1230';
            x.fillRect(0, 0, 1080, 1350);

            x.fillStyle = '#f7dfe6';
            x.beginPath();
            x.roundRect(80, 170, 920, 1010, 36);
            x.fill();

            x.fillStyle = '#c2255c';
            x.font = 'italic 400 48px Fraunces,serif';
            let y = wrap(x, 'kamu diundang untuk', 130, 270, 820, 60);

            x.fillStyle = '#2a1238';
            x.font = '600 92px Fraunces,serif';
            y = wrap(x, t.title, 130, y + 50, 820, 100);

            x.font = '700 38px "DM Sans",sans-serif';
            y = wrap(x, cap(fmtDate(t.date)) + ', pukul ' + t.time, 130, y + 40, 820, 52);

            x.font = '400 36px "DM Sans",sans-serif';
            if (t.notes) y = wrap(x, t.notes, 130, y + 20, 820, 48);

            x.font = 'italic 600 54px Fraunces,serif';
            x.fillText('by ' + t.by, 130, 1110);

            const blob = await new Promise(r => c.toBlob(r, 'image/png'));
            const f = new File([blob], 'tiket-date.png', { type: 'image/png' });

            if (navigator.canShare && navigator.canShare({ files: [f] })) {
                await navigator.share({ files: [f], text });
                return;
            }
        } catch (e) {
            if (e && e.name === 'AbortError') return;
        }

        try {
            if (navigator.share) {
                await navigator.share({ text });
                return;
            }
        } catch (e) {
            if (e && e.name === 'AbortError') return;
        }

        const a = document.createElement('a');
        a.href = 'https://wa.me/?text=' + encodeURIComponent(text);
        a.target = '_blank';
        a.rel = 'noopener';
        a.click();

        try {
        await navigator.clipboard.writeText(text);
        } catch (e) {}
    }

    /* halaman penerima */
    const stLabel = {
        menunggu: 'Menunggu jawaban',
        diterima: 'Diterima',
        ditolak: 'Ditolak'
    };

    const stTime = t => t.answeredAt
        ? ' · ' + new Date(t.answeredAt).toLocaleString('id-ID', {
            dateStyle: 'medium',
            timeStyle: 'short'
        })
        : '';

    async function copyLink(b, id) {
        const t = (await all('tickets')).find(x => x.id === id);
        const old = b.textContent;

        try {
            await navigator.clipboard.writeText(linkOf(t));
            b.textContent = 'Link disalin';
        } catch (e) {
            b.textContent = 'Salin manual dari share';
        }

        setTimeout(() => b.textContent = old, 1800);
    }

  /* riwayat + galeri per tiket */
    let urls = [], mr = null;

    const mediaHTML = m => {
        const u = URL.createObjectURL(m.blob);
        urls.push(u);

        const el = m.blob.type.startsWith('video')
        ? `<video src="${u}" controls playsinline></video>`
        : m.blob.type.startsWith('audio')
            ? `<audio src="${u}" controls></audio>`
            : `<img src="${u}" alt="Foto kenangan">`;

        return `<div class="cell">${el}<button class="btn sm alt" data-a="dm" data-m="${m.id}">Hapus</button></div>`;
    };

    const galHTML = (t, ms) => {
        const mm = ms
        .filter(m => m.tid === t.id)
        .sort((a, b) => a.at - b.at)
        .map(mediaHTML)
        .join('');

        return `<div class="gal"><h2>Kenangan</h2>${mm ? `<div class="media">${mm}</div>` : '<p class="empty" style="padding:4px 0">Belum ada kenangan di date ini.</p>'}
        <div class="acts"><button class="btn sm alt" data-a="pick">Tambah media</button></div>
        <input type="file" accept="image/*,video/*,audio/*" multiple hidden data-a="up"><small class="msg" style="color:var(--mute)" role="status"></small></div>`;
    };

    async function renderHist() {
        urls.forEach(URL.revokeObjectURL);
        urls = [];

        const ts = (await all('tickets')).sort((a, b) => b.at - a.at);
        const ms = await all('media');

        $('#hist').innerHTML = ts.length
        ? ts.map(t => `<div class="item" data-id="${t.id}">${ticketHTML(t)}<div class="meta"><span class="badge ${t.status || 'menunggu'}">${stLabel[t.status || 'menunggu']}${stTime(t)}</span></div><div class="acts"><button class="btn sm" data-a="share">Bagikan</button><button class="btn sm alt" data-a="link">Salin link</button><button class="btn sm alt" data-a="prev">Lihat sebagai penerima</button><button class="btn sm alt" data-a="del">Hapus tiket</button></div>${galHTML(t, ms)}</div>`).join('')
        : '<p class="empty">Belum ada tiket.</p>';
    }

    const ask = (title, body, ok = 'Ya, hapus') => new Promise(res => {
        const d = $('#dlg');
        $('#dlg-t').textContent = title;
        $('#dlg-b').textContent = body;
        d.querySelector('[value=yes]').textContent = ok;
        d.returnValue = '';
        d.onclose = () => res(d.returnValue === 'yes');
        d.showModal();
    });

    $('#hist').addEventListener('click', async e => {
        const b = e.target.closest('button');
        if (!b) return;

        const it = b.closest('.item');
        const id = it.dataset.id;
        const a = b.dataset.a;

        if (a === 'share') {
            share((await all('tickets')).find(x => x.id === id));
        } else if (a === 'link') {
            copyLink(b, id);
        } else if (a === 'prev') {
            window.open('tiket.html?id=' + id, '_blank');
        } else if (a === 'pick') {
            it.querySelector('input[type=file]').click();
        } else if (a === 'rec') {
            record(it, b);
        } else if (a === 'dm' && await ask('Hapus kenangan ini?', 'Foto, video, atau audio ini akan dihapus dari tiket.')) {
            await del('media', b.dataset.m);
            renderHist();
        } else if (a === 'del' && await ask('Hapus tiket “' + it.querySelector('.tk-title').textContent + '”?', 'Tiket, status jawabannya, dan kenangan di perangkat ini akan dihapus permanen. Link yang sudah dikirim ke Icel juga tidak bisa dibuka lagi.')) {
            await del('tickets', id);

            for (const m of (await all('media')).filter(m => m.tid === id)) {
                await del('media', m.id);
            }

            renderHist();
        }
    });

    $('#hist').addEventListener('change', e => {
        const i = e.target;

        if (i.dataset.a === 'up' && i.files.length) {
            addFiles(i.closest('.item'), [...i.files]);
        }
    });

    async function addFiles(it, files) {
        for (const f of files) {
            await put('media', {
                id: 'm' + Date.now() + Math.random().toString(36).slice(2, 6),
                tid: it.dataset.id,
                at: Date.now(),
                blob: f
            });
        }

        renderHist();
    }

    async function record(it, b) {
        if (mr) {
            mr.stop();
            return;
        }

        try {
            const s = await navigator.mediaDevices.getUserMedia({ audio: true });
            const ch = [];

            mr = new MediaRecorder(s);

            mr.ondataavailable = e => ch.push(e.data);

            mr.onstop = () => {
                s.getTracks().forEach(t => t.stop());

                const blob = new Blob(ch, { type: mr.mimeType || 'audio/webm' });
                mr = null;

                addFiles(it, [blob]);
            };

            mr.start();
            b.textContent = 'Berhenti & simpan';
            } catch (e) {
            it.querySelector('.msg').textContent = 'Mikrofon tidak bisa diakses. Kamu tetap bisa mengunggah file voice note.';
        }
    }

  /* awal */
    draw();

} else {
    async function renderTamu(id) {
        const box = $('#tamu');
        const t = await one(id);

        if (!t) {
            box.innerHTML = '<p class="empty">Tiket ini belum bisa dibuka di perangkat ini.</p>';
            return;
        }

        const st = t.status || 'menunggu';

        box.innerHTML = ticketHTML(t) + (st === 'menunggu'
            ? `<h2 style="margin-top:28px">Kamu mau datang?</h2><div class="acts" style="margin-top:12px"><button class="btn big" data-r="diterima">Terima</button><button class="btn big alt" data-r="ditolak">Tolak</button></div>`
            : `<div class="done ${st}" role="status"><b>${st === 'diterima' ? 'Undangan diterima' : 'Undangan ditolak'}</b><span>${st === 'diterima' ? 'Jawabanmu sudah tersimpan. Sampai jumpa di hari itu!' : 'Jawabanmu sudah tersimpan.'}</span></div>`);

        box.dataset.id = id;
    }

    $('#tamu').addEventListener('click', async e => {
        const b = e.target.closest('[data-r]');
        if (!b) return;

        const id = $('#tamu').dataset.id;
        const t = await one(id);

        if (!t) return;

        t.status = b.dataset.r;
        t.answeredAt = Date.now();

        await put('tickets', t);
        renderTamu(id);
    });

    renderTamu(new URLSearchParams(location.search).get('id'));
}