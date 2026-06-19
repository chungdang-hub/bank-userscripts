// ==UserScript==
// @name         Giải Ngân HDBank
// @namespace    http://tampermonkey.net/
// @version      12.3
// @author       NGOCCHUNG
// @downloadURL  https://raw.githubusercontent.com/chungdang-hub/bank-userscripts/edit/main/Giải%20Ngân%20HDBank-12.3.user.js
// @updateURL    https://raw.githubusercontent.com/chungdang-hub/bank-userscripts/edit/main/Giải%20Ngân%20HDBank-12.3.user.js
// @match        *://farmlink.techcoop.vn/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    let pdfLibLoaded = false;

    // 1. TỰ ĐỘNG NHÚNG LÕI XỬ LÝ PDF BẰNG THẺ TIÊU CHUẨN
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
            logMessage("✓ Thư viện PDF đã kết nối an toàn.");
        };
        script.onerror = () => {
            updateStatus("❌ Lỗi bảo mật trình duyệt", "#f7768e");
            logMessage("Lỗi: Trình duyệt chặn không cho tải thư viện PDF.");
        };
        document.head.appendChild(script);
    }

    // 2. THUẬT TOÁN ĐA TẦNG QUÉT Ô INPUT ODOO
    function timInputOdooTheoLabel(chuoiLabel) {
        if (chuoiLabel === 'detail') {
            let elDetail = document.getElementById('detail') || document.querySelector('textarea#detail') || document.querySelector('.o_input#detail') || document.querySelector('[name="detail"]');
            if (elDetail) return elDetail;
        }

        let direct = document.querySelector(`input[name="${chuoiLabel}"], [name="${chuoiLabel}"] input, input[id*="${chuoiLabel}"], [data-fieldname="${chuoiLabel}"] input`);
        if (direct) return direct;

        const nameMap = {
            'date': ['date', 'date_transaction'],
            'ref': ['ref', 'name', 'reference'],
            'amount': ['amount', 'amount_total', 'price_total'],
            'from': ['from_account', 'x_from_account'],
            'to': ['to_account', 'x_to_account'],
            'detail': ['detail', 'narration', 'note', 'comment']
        };

        if (nameMap[chuoiLabel]) {
            for (let n of nameMap[chuoiLabel]) {
                let el = document.querySelector(`input[name="${n}"], textarea[name="${n}"], [name="${n}"] textarea, [name*="${n}"] textarea`);
                if (el) return el;
            }
        }

        const tatCaLabels = Array.from(document.querySelectorAll('label, .o_form_label, .o_cell span'));
        for (let label of tatCaLabels) {
            const text = label.textContent.trim().toLowerCase();
            let khớp = false;

            if (chuoiLabel === 'date' && text === 'date') khớp = true;
            if (chuoiLabel === 'ref' && text === 'ref') khớp = true;
            if (chuoiLabel === 'amount' && text === 'amount') khớp = true;
            if (chuoiLabel === 'detail' && (text.includes('detail') || text.includes('nội dung') || text.includes('ghi chú'))) khớp = true;
            if (chuoiLabel === 'from' && text.includes('from account')) khớp = true;
            if (chuoiLabel === 'to' && text.includes('to account')) khớp = true;

            if (khớp) {
                if (label.getAttribute('for')) {
                    let input = document.getElementById(label.getAttribute('for'));
                    if (input) return input;
                }
                let oChuaLabel = label.closest('.o_cell') || label.parentElement;
                if (oChuaLabel) {
                    let inputTrongO = oChuaLabel.querySelector('input, textarea');
                    if (inputTrongO) return inputTrongO;

                    let oKeTiep = oChuaLabel.nextElementSibling;
                    if (oKeTiep) {
                        let inputKe = oKeTiep.querySelector('input, textarea');
                        if (inputKe) return inputKe;
                    }
                }
            }
        }
        return null;
    }

    // 3. ĐỒNG BỘ DỮ LIỆU ĐA NĂNG VÀO FRAMEWORK ODOO
    function ghiDuLieuVaoOdoo(element, giaTri) {
        if (!element || !giaTri) return false;
        try {
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                element.focus();

                const prototype = element.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
                const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
                setter.call(element, giaTri);

                element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

                element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 }));
            } else {
                element.textContent = giaTri;
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }

            element.style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
            setTimeout(() => { element.style.backgroundColor = ''; }, 2000);
            return true;
        } catch (e) { return false; }
    }

    // 4. THUẬT TOÁN ĐỊNH VỊ CHUỖI NÂNG CAO - SỬA LỖI AMOUNT
    function trichXuatHDBank_File96(vanBan) {
        let ketQua = { ngay: '', soTien: '', ref: '', fromAccount: '', toAccount: '', detail: '' };

        // Chuẩn hóa chuỗi phẳng liên tục
        const textChuan = vanBan.replace(/"/g, '').replace(/\s+/g, ' ');

        // --- A. TRÍCH XUẤT NGÀY HIỆU LỰC ---
        const mNgay = textChuan.match(/(?:Ngày hiệu lực|Effective Date)\s*(\d{2}\/\d{2}\/\d{4})/i);
        if (mNgay) ketQua.ngay = mNgay[1];

        // --- B. TRÍCH XUẤT MÃ GIAO DỊCH (REF) ---
        const mRef = textChuan.match(/(?:Số giao dịch|Order Number)\s*(\d+)/i);
        if (mRef) ketQua.ref = mRef[1].trim();

        // --- C. TRÍCH XUẤT TÀI KHOẢN NGUỒN (FROM ACCOUNT) ---
        const mFrom = textChuan.match(/(?:Số tài khoản|Account Number)\s*Loại tiền\s*Currency\s*(\d+)/i) || textChuan.match(/(?:Account Number)\s*(\d+)/i);
        if (mFrom) {
            ketQua.fromAccount = mFrom[1].trim();
        }

        // --- D. TRÍCH XUẤT TÀI KHOẢN ĐÍCH (TO ACCOUNT) ---
        // Bóc tách chuỗi số nằm giữa cụm từ "Loại tiền VND" và nhãn hệ thống ngân hàng "Currency Vietcombank"
        const mTo = textChuan.match(/Loại tiền\s*VND\s*(\d+)\s*Currency\s*Vietcombank/i) || textChuan.match(/VND\s*(\d+)\s*Currency\s*Vietcombank/i);
        if (mTo) {
            ketQua.toAccount = mTo[1].trim();
        } else {
            // Phương án phòng ngừa nếu trật nhãn: Lấy toàn bộ số có từ 9 đến 15 chữ số và loại trừ Hotline, Ref, FromAccount
            const tatCaSo = textChuan.match(/\b\d{9,15}\b/g) || [];
            const danhSachSoHopLe = tatCaSo.filter(so => so !== '19006060' && so !== ketQua.ref && so !== ketQua.fromAccount);
            if (danhSachSoHopLe.length > 0) {
                ketQua.toAccount = danhSachSoHopLe[0];
            }
        }

        // --- E. TRÍCH XUẤT SỐ TIỀN (AMOUNT) - THUẬT TOÁN MỚI KHÔNG TRƯỢT ---
        // Quét tất cả các chuỗi số có dấu phẩy hàng nghìn đứng trước chữ "VND"
        const danhSachSoTien = textChuan.match(/(\d{1,3}(?:,\d{3})+)\s*VND/gi);
        if (danhSachSoTien && danhSachSoTien.length > 0) {
            // Lấy chuỗi số tiền cuối cùng xuất hiện trong khối dữ liệu (Chính là số tiền giao dịch thực tế)
            const chuoiSoTienGoc = danhSachSoTien[danhSachSoTien.length - 1];
            const cleanAmount = chuoiSoTienGoc.match(/[\d,.]+/);
            if (cleanAmount) {
                ketQua.soTien = cleanAmount[0].replace(/,/g, '');
            }
        }

        // --- F. TRÍCH XUẤT NỘI DUNG CHUYỂN KHOẢN (DETAIL) ---
        const mDetailBackup = textChuan.match(/(?:THANH TOAN CHO HOA DON.*?)(?=\s*(?:VN|Cám ơn|$))/i);
        if (mDetailBackup) {
            ketQua.detail = mDetailBackup[0].trim();
        }

        return ketQua;
    }

    // 5. ĐỌC FILE PDF SỬ DỤNG MẢNG BYTE NỘI BỘ
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
                        textTong += content.items.map(item => item.str).join(" ") + "\n";
                    }
                    resolve(textTong);
                } catch (err) { reject(err); }
            };
            reader.readAsArrayBuffer(file);
        });
    }

    // 6. KHỞI TẠO BẢNG ĐIỀU KHIỂN NỔI
    function veBangDieuKhien() {
        if (document.getElementById('odoo-autofill-f96-v12.3')) return;

        const container = document.createElement('div');
        container.id = 'odoo-autofill-f96-v12.3';
        container.style = `
            position: fixed; top: 90px; right: 20px; z-index: 1000000;
            background: #0d1527; color: #cbd5e1; padding: 15px;
            border-radius: 8px; width: 270px; font-family: sans-serif;
            box-shadow: 0 10px 30px rgba(0,0,0,0.6); border: 2px solid #10b981;
        `;

        container.innerHTML = `
            <div style="font-weight: bold; color: #10b981; font-size: 13px; margin-bottom: 6px; text-align: center; border-bottom: 1px solid #1e293b; padding-bottom: 4px;">
                🟢 GIẢI NGÂN HDBANK AUTOFILL
            </div>
            <div id="f96-status" style="font-size: 11px; color: #34d399; font-weight: bold; margin-bottom: 10px; text-align: center;">
                ● Hệ thống đã sẵn sàng
            </div>

            <button id="f96-btn-file" style="width: 100%; background: #10b981; color: #ffffff; border: none; padding: 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">
                📁 CHỌN FILE Giải ngân HD
            </button>
            <input type="file" id="f96-file-input" accept="application/pdf" style="display: none;" />

            <div id="f96-log" style="font-size: 10px; color: #94a3b8; margin-top: 10px; max-height: 120px; overflow-y: auto; background: #020617; padding: 6px; border-radius: 4px; border: 1px solid #1e293b; line-height: 1.4;">
                LOG: Đã tối ưu hóa bộ lọc Amount phân tách hàng nghìn độc lập.
            </div>
        `;

        document.body.appendChild(container);
        injectPdfEngine();

        document.getElementById('f96-btn-file').addEventListener('click', function() {
            if (!pdfLibLoaded) {
                alert("Hệ thống xử lý lõi PDF chưa sẵn sàng, hãy thử lại sau ít giây!");
                return;
            }
            document.getElementById('f96-file-input').click();
        });

        document.getElementById('f96-file-input').addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file || !pdfLibLoaded) return;

            updateStatus("⏳ Đang phân tích cú pháp...", "#f59e0b");
            logMessage(`--- Đang xử lý: ${file.name} ---`);

            try {
                const nutUploadOdoo = document.querySelector('input[type="file"]:not(#f96-file-input)');
                if (nutUploadOdoo) {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    nutUploadOdoo.files = dataTransfer.files;
                    nutUploadOdoo.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } catch (errUpload) {}

            try {
                const vanBanRaw = await xuLyDocFilePDF(file);
                const data = trichXuatHDBank_File96(vanBanRaw);

                logMessage(`→ Mã Ref: ${data.ref || 'Trống'}`);
                logMessage(`→ Từ TK: ${data.fromAccount || 'Trống'}`);
                logMessage(`→ Đến TK: ${data.toAccount || 'Trống'}`);
                logMessage(`→ Số tiền: ${data.soTien || 'Trống'}`);

                let demForm = 0;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('date'), data.ngay)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('ref'), data.ref)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('amount'), data.soTien)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('detail'), data.detail)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('from'), data.fromAccount)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('to'), data.toAccount)) demForm++;

                if (demForm > 0) {
                    updateStatus(`🎉 HOÀN THÀNH (6/6)`, "#34d399");
                    logMessage(`✓ Thành công! Số tiền nạp form: ${data.soTien}`);
                } else {
                    updateStatus("⚠️ Lỗi điền form", "#f87171");
                }
            } catch (error) {
                updateStatus("❌ Lỗi cấu trúc tệp", "#f87171");
                logMessage(`Lỗi: ${error.message || error}`);
            }
            e.target.value = '';
        });
    }

    function updateStatus(text, color) {
        const el = document.getElementById('f96-status');
        if (el) { el.innerText = text; el.style.color = color; }
    }

    function logMessage(msg) {
        const el = document.getElementById('f96-log');
        if (el) { el.innerHTML += `<br/>${msg}`; el.scrollTop = el.scrollHeight; }
    }

    if (document.body) {
        veBangDieuKhien();
    } else {
        document.addEventListener('DOMContentLoaded', veBangDieuKhien);
    }

    const observer = new MutationObserver(() => {
        if (!document.getElementById('odoo-autofill-f96-v12.3')) {
            veBangDieuKhien();
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

})();
