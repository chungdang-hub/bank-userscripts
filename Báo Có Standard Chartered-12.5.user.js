// ==UserScript==
// @name         Báo Có Standard Chartered
// @namespace    http://tampermonkey.net/
// @version      12.5
// @description  Tuyệt chiêu nén chuỗi, bắt chính xác tuyệt đối Amount 190 triệu
// @downloadURL  https://raw.githubusercontent.com/chungdang-hub/bank-userscripts/edit/main/Báo%20Có%20Standard%20Chartered-12.5.user.js
// @updateURL    https://raw.githubusercontent.com/chungdang-hub/bank-userscripts/edit/main/Báo%20Có%20Standard%20Chartered-12.5.user.js
// @author       NGOCCHUNG
// @match        *://farmlink.techcoop.vn/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    let pdfLibLoaded = false;

    // 1. TỰ ĐỘNG NHÚNG LÕI XỬ LÝ PDF
    function injectPdfEngine() {
        if (window.pdfjsLib) {
            pdfLibLoaded = true;
            updateStatus("● Lõi PDF đã sẵn sàng", "#9ece6a");
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
        script.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
            pdfLibLoaded = true;
            updateStatus("● Lõi PDF đã sẵn sàng", "#9ece6a");
        };
        script.onerror = () => updateStatus("❌ Lỗi bảo mật trình duyệt", "#f7768e");
        document.head.appendChild(script);
    }

    // 2. TÌM Ô NHẬP ODOO
    function timInputOdooTheoLabel(chuoiLabel) {
        if (chuoiLabel === 'detail') {
            let elDetail = document.querySelector('textarea#detail') || document.querySelector('.o_input#detail') || document.querySelector('input[name="detail"], textarea[name="detail"]');
            if (elDetail) return elDetail;
        }
        let direct = document.querySelector(`input[name="${chuoiLabel}"], [name="${chuoiLabel}"] input, input[id*="${chuoiLabel}"], [data-fieldname="${chuoiLabel}"] input`);
        if (direct) return direct;

        const nameMap = {
            'date': ['date', 'date_transaction', 'x_date'],
            'ref': ['ref', 'name', 'reference'],
            'amount': ['amount', 'amount_total', 'x_amount'],
            'from': ['from_account', 'x_from_account', 'partner_bank_id'],
            'to': ['to_account', 'x_to_account', 'bank_account_id'],
            'detail': ['detail', 'narration', 'note', 'memo']
        };

        if (nameMap[chuoiLabel]) {
            for (let n of nameMap[chuoiLabel]) {
                let el = document.querySelector(`input[name="${n}"], textarea[name="${n}"], [name="${n}"] input, [name="${n}"] textarea`);
                if (el) return el;
            }
        }

        const tatCaLabels = Array.from(document.querySelectorAll('label, .o_form_label, span'));
        for (let label of tatCaLabels) {
            const text = label.textContent.trim().toLowerCase();
            let khớp = false;
            if (chuoiLabel === 'date' && (text === 'date' || text === 'ngày')) khớp = true;
            if (chuoiLabel === 'amount' && (text === 'amount' || text === 'số tiền')) khớp = true;
            if (chuoiLabel === 'detail' && (text === 'detail' || text.includes('nội dung') || text === 'diễn giải')) khớp = true;
            if (chuoiLabel === 'from' && (text.includes('from account') || text.includes('tài khoản nguồn'))) khớp = true;
            if (chuoiLabel === 'to' && (text.includes('to account') || text.includes('tài khoản đích'))) khớp = true;

            if (khớp) {
                if (label.getAttribute('for')) {
                    let input = document.getElementById(label.getAttribute('for'));
                    if (input) return input;
                }
                let container = label.parentElement;
                if (container) {
                    let inputTrongO = container.querySelector('input, textarea');
                    if (inputTrongO && inputTrongO !== label) return inputTrongO;
                    let oKeTiep = container.nextElementSibling;
                    if (oKeTiep) {
                        let inputKe = oKeTiep.querySelector('input, textarea');
                        if (inputKe) return inputKe;
                    }
                }
            }
        }
        return null;
    }

    // 3. ĐỒNG BỘ DỮ LIỆU VÀO ODOO
    function ghiDuLieuVaoOdoo(element, giaTri) {
        if (!element || giaTri === undefined || giaTri === null || giaTri === "") return false;
        try {
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                element.focus();
                const prototype = element.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
                const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
                setter.call(element, giaTri);

                element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: giaTri.toString().slice(-1) }));
                element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                element.dispatchEvent(new Event('blur', { bubbles: true }));
            } else {
                element.textContent = giaTri;
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }

            element.style.backgroundColor = 'rgba(26, 188, 156, 0.2)';
            setTimeout(() => { element.style.backgroundColor = ''; }, 2000);
            return true;
        } catch (e) { return false; }
    }

   // 4. BỘ PHÂN TÍCH CHUỖI
    function trichXuatDuLieuStandardChartered(vanBan) {
        let ketQua = { ngay: '', soTien: '', ref: '', fromAccount: '', toAccount: '', detail: '' };

        let textSach = vanBan.replace(/"/g, '');

        const textChuan = textSach.replace(/\s+/g, ' ');
        const dsNgay = [...textChuan.matchAll(
            /(\d{2})-([A-Za-z]{3})-(\d{2,4})/g
        )];

        if (dsNgay.length > 0) {
    const mNgay = dsNgay[dsNgay.length - 1];

    const cacThang = {
        JAN: "01", FEB: "02", MAR: "03", APR: "04",
        MAY: "05", JUN: "06", JUL: "07", AUG: "08",
        SEP: "09", OCT: "10", NOV: "11", DEC: "12"
    };

    const ngay = mNgay[1];
    const thang = cacThang[mNgay[2].toUpperCase()];
    const nam = mNgay[3].length === 2 ? "20" + mNgay[3] : mNgay[3];

    ketQua.ngay = `${ngay}/${thang}/${nam}`;
}

        // [2] QUÉT SỐ TIỀN

        const allAmounts = [
            ...textChuan.matchAll(/\b\d{1,3}(?:,\d{3})+(?:\.\d{2})?\b/g)
        ];

        if (allAmounts.length > 0) {
            ketQua.soTien = allAmounts[0][0]
                .replace(/,/g, '')
                .replace(/\.00$/, '');
        }
        // [3] QUÉT DIỄN GIẢI (DETAIL)

        let mDetail = textChuan.match(
            /Payment Details\s*([\s\S]+?)(?:Bank Charge|FX Rate|Foreign Exchange|$)/i
        );

        if (!mDetail) {
            mDetail = textChuan.match(
                /((?:IBFT|VN5|IL9)[\s\S]+?)(?:Foreign Exchange|FX Rate|Bank Charge|$)/i
            );
        }

        if (mDetail) {
            ketQua.detail = mDetail[1]
                .replace(/\s+/g, ' ')
                .trim();
        }

        // [4] QUÉT TÀI KHOẢN NHẬN (TO ACCOUNT)
        const mToAcc = textChuan.match(/\b([A-Z]{3,}\d{8,15})\b/i);
        if (mToAcc) {
            ketQua.toAccount = mToAcc[1]
                .replace(/^VND/i, '');
        }

        // [5] QUÉT TÀI KHOẢN CHUYỂN (FROM ACCOUNT)
        const tatCaSo = [...textChuan.matchAll(/\b(\d{9,14})\b/g)].map(m => m[1]);
        if (tatCaSo.length > 0) {
            let tkNguon = tatCaSo.find(so => !so.startsWith('202'));
            if (tkNguon) ketQua.fromAccount = tkNguon;
        }

        return ketQua;
    }
   // 5. ĐỌC PDF TRỰC TIẾP (Cải tiến: Xử lý theo khối để không nhầm lẫn)
    async function xuLyDocFilePDF(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async function() {
                try {
                    const typedarray = new Uint8Array(this.result);
                    const pdf = await window.pdfjsLib.getDocument({ data: typedarray }).promise;

                    let textTong = "";
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const content = await page.getTextContent();

                        // Sắp xếp các đoạn text theo vị trí tọa độ (y, x) để đảm bảo đọc đúng dòng
                        const items = content.items.sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
                        textTong += items.map(item => item.str).join(" ") + "\n";
                    }
                    resolve(textTong);
                } catch (err) { reject(err); }
            };
            reader.readAsArrayBuffer(file);
        });
    }

    // 6. KHỞI TẠO GIAO DIỆN
    function veBangDieuKhien() {
        if (document.getElementById('odoo-autofill-v9')) return;

        const container = document.createElement('div');
        container.id = 'odoo-autofill-v9';
        container.style = `
            position: fixed; top: 90px; right: 20px; z-index: 1000000;
            background: #1a1b26; color: #a9b1d6; padding: 15px;
            border-radius: 8px; width: 260px; font-family: sans-serif;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 2px solid #bb9af7;
        `;

        container.innerHTML = `
            <div style="font-weight: bold; color: #bb9af7; font-size: 13px; margin-bottom: 6px; text-align: center; border-bottom: 1px solid #444b6a; padding-bottom: 4px;">
                🦊 BÁO CÓ SCBANK AUTOFILL
            </div>
            <div id="v9-status" style="font-size: 11px; color: #9ece6a; font-weight: bold; margin-bottom: 10px; text-align: center;">
                ● Sẵn sàng (Nén chuỗi Amount)
            </div>

            <button id="v9-btn-test" style="width: 100%; background: #24283b; color: #bb9af7; border: 1px solid #bb9af7; padding: 7px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; margin-bottom: 8px;">
                🔍 KIỂM TRA FORM ODOO
            </button>

            <button id="v9-btn-file" style="width: 100%; background: #bb9af7; color: #1a1b26; border: none; padding: 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">
                📁 CHỌN FILE BÁO CÓ SCbank
            </button>
            <input type="file" id="v9-file-input" accept="application/pdf" style="display: none;" />

            <div id="v9-log" style="font-size: 10px; color: #a9b1d6; margin-top: 10px; max-height: 120px; overflow-y: auto; background: #10101a; padding: 6px; border-radius: 4px; border: 1px solid #24283b; line-height: 1.4;">
                HỆ THỐNG v12.5: Đã áp dụng tính năng Nén Chuỗi, đảm bảo bốc chính xác định dạng Số Tiền.
            </div>
        `;

        document.body.appendChild(container);
        injectPdfEngine();

        document.getElementById('v9-btn-test').addEventListener('click', function() {
            const fields = ['date', 'amount', 'from', 'to', 'detail'];
            let foundCount = 0;
            logMessage("--- Kiểm tra form ---");
            fields.forEach(f => {
                let el = timInputOdooTheoLabel(f);
                if (el) {
                    foundCount++;
                    el.style.backgroundColor = '#ffeaa7';
                    setTimeout(() => { el.style.backgroundColor = ''; }, 2000);
                    logMessage(`✓ Khớp: [${f.toUpperCase()}]`);
                } else {
                    logMessage(`❌ Trượt: [${f.toUpperCase()}]`);
                }
            });
            logMessage(`Đã tìm thấy ${foundCount}/5 ô.`);
        });

        document.getElementById('v9-btn-file').addEventListener('click', function() {
            if (!pdfLibLoaded) { alert("Vui lòng đợi giây lát, lõi PDF đang kết nối!"); return; }
            document.getElementById('v9-file-input').click();
        });

        document.getElementById('v9-file-input').addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file || !pdfLibLoaded) return;

            updateStatus("⏳ Đang phân tích...", "#ff9e64");
            logMessage(`--- File: ${file.name} ---`);

            try {
                const nutUploadOdoo = document.querySelector('input[type="file"]:not(#v9-file-input)') || document.querySelector('.o_select_file_button_custom');
                if (nutUploadOdoo) {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    nutUploadOdoo.files = dataTransfer.files;
                    nutUploadOdoo.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } catch (errUpload) {}

            try {
                const vanBanRaw = await xuLyDocFilePDF(file);
                const data = trichXuatDuLieuStandardChartered(vanBanRaw);

                logMessage(`✓ Ngày: ${data.ngay || 'Trống'}`);
                logMessage(`✓ Số tiền: ${data.soTien || 'Trống'}`);
                logMessage(`✓ Tới TK: ${data.toAccount || 'Trống'}`);
                logMessage(`✓ Nội dung: ${data.detail ? data.detail.substring(0, 30) + '...' : 'Trống'}`);

                let demForm = 0;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('date'), data.ngay)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('amount'), data.soTien)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('detail'), data.detail)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('from'), data.fromAccount)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('to'), data.toAccount)) demForm++;

                if (demForm > 0) {
                    updateStatus(`🎉 HOÀN THÀNH (${demForm} ô)`, "#9ece6a");
                    logMessage(`→ Điền tự động thành công.`);
                } else {
                    updateStatus("⚠️ Không tìm thấy ô nhập", "#f7768e");
                }
            } catch (error) {
                updateStatus("❌ Lỗi hệ thống", "#f7768e");
                logMessage(`Lỗi: ${error.message}`);
            }
            e.target.value = '';
        });
    }

    function updateStatus(text, color) {
        const el = document.getElementById('v9-status');
        if (el) { el.innerText = text; el.style.color = color; }
    }

    function logMessage(msg) {
        const el = document.getElementById('v9-log');
        if (el) { el.innerHTML += `<br/>${msg}`; el.scrollTop = el.scrollHeight; }
    }

    if (document.body) veBangDieuKhien();
    else document.addEventListener('DOMContentLoaded', veBangDieuKhien);

})();
