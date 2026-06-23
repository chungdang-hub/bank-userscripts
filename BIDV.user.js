// ==UserScript==
// @name         BIDV
// @namespace    http://tampermonkey.net/
// @version      13.1
// @author       NGOCCHUNG
// @downloadURL  https://raw.githubusercontent.com/chungdang-hub/bank-userscripts/main/Bao-Co-BIDV.user.js
// @updateURL    https://raw.githubusercontent.com/chungdang-hub/bank-userscripts/main/Bao-Co-BIDV.user.js
// @match        *://farmlink.techcoop.vn/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // DANH SÁCH TÀI KHOẢN CÔNG TY
    const DS_TK_CONG_TY = ["8660017702"];

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
            logMessage("✓ Thư viện PDF đã kết nối an toàn.");
        };
        script.onerror = () => {
            updateStatus("❌ Lỗi bảo mật trình duyệt", "#f7768e");
        };
        document.head.appendChild(script);
    }

    // 2. THUẬT TOÁN ĐA TẦNG TÌM Ô NHẬP ODOO
    function timInputOdooTheoLabel(chuoiLabel) {
        if (chuoiLabel === 'detail') {
            let elDetail = document.getElementById('detail') || document.querySelector('textarea#detail') || document.querySelector('.o_input#detail') || document.querySelector('[name="detail"]');
            if (elDetail) return elDetail;
        }

        let direct = document.querySelector(`input[name="${chuoiLabel}"], [name="${chuoiLabel}"] input, input[id*="${chuoiLabel}"], [data-fieldname="${chuoiLabel}"] input`);
        if (direct) return direct;

        const nameMap = {
            'date': ['date', 'date_transaction'],
            'amount': ['amount', 'amount_total', 'price_total'],
            'to': ['to_account', 'x_to_account', 'destination_account'],
            'from': ['from_account', 'x_from_account'],
            'ref': ['ref', 'reference', 'name'],
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
            let khop = false;

            if (chuoiLabel === 'date' && (text === 'date' || text === 'ngày')) khop = true;
            if (chuoiLabel === 'amount' && (text === 'amount' || text === 'số tiền')) khop = true;
            if (chuoiLabel === 'detail' && (text === 'detail' || text.includes('nội dung') || text.includes('ghi chú') || text === 'diễn giải')) khop = true;
            if (chuoiLabel === 'to' && (text.includes('to account') || text.includes('tài khoản đích') || text.includes('tài khoản đến')) && !text.includes('name') && !text.includes('tên')) khop = true;
            if (chuoiLabel === 'from' && (text.includes('from account') || text.includes('tài khoản nguồn'))) khop = true;
            if (chuoiLabel === 'ref' && (text.includes('ref') || text.includes('reference') || text.includes('số tham chiếu'))) khop = true;

            if (khop) {
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

    // 3. ĐỒNG BỘ DỮ LIỆU VÀO Ô CHỈ ĐỊNH (ĐÃ FIX: CHO PHÉP GHI CHUỖI RỖNG ĐỂ XÓA TRỐNG FORM)
    function ghiDuLieuVaoOdoo(element, giaTri) {
        if (!element || giaTri === null || giaTri === undefined) {
            return false;
        }

        // Chuẩn hóa giá trị về dạng chuỗi chu đáo (kể cả chuỗi rỗng "")
        const giaTriStr = String(giaTri).trim();

        try {
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                element.focus();
                const prototype = element.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
                const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
                setter.call(element, giaTriStr);

                element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                element.dispatchEvent(new Event('blur', { bubbles: true }));
            } else {
                element.textContent = giaTriStr;
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Hiệu ứng đổi màu phản hồi trực quan
            if (giaTriStr === "") {
                element.style.backgroundColor = 'rgba(247, 118, 142, 0.2)'; // Màu đỏ nhạt báo hiệu vừa xóa trống ô
            } else {
                element.style.backgroundColor = 'rgba(26, 188, 156, 0.2)'; // Màu xanh nhạt báo hiệu điền dữ liệu
            }
            setTimeout(() => { element.style.backgroundColor = ''; }, 2000);
            return true;
        } catch (e) { return false; }
    }

    // 4. BỘ PHÂN TÍCH CHUỖI GỘP (AUTO-DETECT TỪ BIDV)
    function trichXuatDuLieuBIDV(vanBan) {
        let ketQua = {
            loaiGiaoDich: 'CHƯA RÕ',
            ngay: '',
            soTien: '',
            toAccount: '',
            fromAccount: '',
            detail: '',
            ref: ''
        };

        // Chuẩn hóa khoảng trắng
        vanBan = vanBan.replace(/\s+/g, " ").trim();

        // PHÂN LOẠI GIAO DỊCH DỰA VÀO MÃ REF HOẶC TỪ KHÓA
        let isBaoCo = false;
        if (vanBan.match(/CTLNHIDI|ACH0|B2B/i) || vanBan.toLowerCase().includes("báo có")) {
            isBaoCo = true;
            ketQua.loaiGiaoDich = "BÁO CÓ (TIỀN VÀO)";
        } else if (vanBan.match(/CTLNHIDO/i) || vanBan.toLowerCase().includes("báo nợ")) {
            isBaoCo = false;
            ketQua.loaiGiaoDich = "BÁO NỢ (TIỀN RA)";
        } else {
            isBaoCo = true;
            ketQua.loaiGiaoDich = "BÁO CÓ (DỰ ĐOÁN)";
        }

        // =========================
        // TRÍCH XUẤT THEO LOGIC RIÊNG
        // =========================
        if (isBaoCo) {
            // LOGIC BÁO CÓ
            const mNgay = vanBan.match(/Ngày hiệu lực[\s\S]*?(\d{2}\/\d{2}\/\d{4})/i);
            if (mNgay) ketQua.ngay = mNgay[1];

            const mTk = vanBan.match(/Số tài khoản\s*(\d{6,20})/i);
            if (mTk) ketQua.toAccount = mTk[1];

            const mFrom = vanBan.match(/TKTHE\s*:\s*(\d+)/i);
            if (mFrom) ketQua.fromAccount = mFrom[1];

            const mRef = vanBan.match(/((?:CTLNHIDI|ACH0|B2B)[\w\-\/]+)/i);
            if (mRef) ketQua.ref = mRef[1];

        } else {
            // LOGIC BÁO NỢ
            const mNgay = vanBan.match(/(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}:\d{2}\s+\d{1,3}(?:,\d{3})*\s+VND/i);
            if (mNgay) ketQua.ngay = mNgay[1];

            const mFrom = vanBan.match(/Số tài khoản\s*(\d{6,20})/i);
            if (mFrom) ketQua.fromAccount = mFrom[1];

            const mTo = vanBan.match(/TKTHE\s*:?\s*(\d{6,20})/i);
            if (mTo) ketQua.toAccount = mTo[1];

            const mRef = vanBan.match(/-?(CTLNHIDO[\w\/-]+)/i);
            if (mRef) ketQua.ref = mRef[1];
        }

        // =========================
        // TRÍCH XUẤT CHUNG (SỐ TIỀN & DIỄN GIẢI)
        // =========================
        const mTien = vanBan.match(/(\d{1,3}(?:,\d{3})*)\s+VND/i) || vanBan.match(/(\d{1,3}(?:,\d{3})*)\s*VND/i);
        if (mTien) ketQua.soTien = mTien[1].replace(/,/g, '');

        const mDetail = vanBan.match(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+\d{1,3}(?:,\d{3})*\s+VND\s+([\s\S]+)/i);
        if (mDetail) {
            ketQua.detail = mDetail[1].replace(/\s+/g, ' ').trim();
        }

        return ketQua;
    }

    // 5. ĐỌC PDF TRỰC TIẾP
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
                        textTong += content.items.map(item => item.str).join(" ") + " ";
                    }
                    resolve(textTong);
                } catch (err) { reject(err); }
            };
            reader.readAsArrayBuffer(file);
        });
    }

    // 6. KHỞI TẠO BẢNG ĐIỀU KHIỂN GIAO DIỆN
    function veBangDieuKhien() {
        if (document.getElementById('odoo-autofill-v13-combo')) return;

        const container = document.createElement('div');
        container.id = 'odoo-autofill-v13-combo';
        container.style = `
            position: fixed; top: 60px; right: 20px; z-index: 1000000;
            background: #1a1b26; color: #a9b1d6; padding: 15px;
            border-radius: 8px; width: 280px; font-family: sans-serif;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 2px solid #7aa2f7;
        `;

        container.innerHTML = `
            <div style="font-weight: bold; color: #7aa2f7; font-size: 13px; margin-bottom: 6px; text-align: center; border-bottom: 1px solid #444b6a; padding-bottom: 4px;">
                🦊 BIDV AUTOFILL (COMBO)
            </div>
            <div id="v13-status" style="font-size: 11px; color: #9ece6a; font-weight: bold; margin-bottom: 10px; text-align: center;">
                ● Sẵn sàng (Universal Engine)
            </div>

            <button id="v13-btn-test" style="width: 100%; background: #24283b; color: #7aa2f7; border: 1px solid #7aa2f7; padding: 7px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; margin-bottom: 8px;">
                🔍 KIỂM TRA FORM ODOO
            </button>

            <button id="v13-btn-file" style="width: 100%; background: #7aa2f7; color: #1a1b26; border: none; padding: 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">
                📁 CHỌN FILE PDF BIDV
            </button>
            <input type="file" id="v13-file-input" accept="application/pdf" style="display: none;" />

            <div id="v13-log" style="font-size: 10px; color: #a9b1d6; margin-top: 10px; max-height: 120px; overflow-y: auto; background: #10101a; padding: 6px; border-radius: 4px; border: 1px solid #24283b; line-height: 1.4;">
                HỆ THỐNG: Sẵn sàng ghi đè xóa trống nếu file PDF mới không có dữ liệu.
            </div>
        `;

        document.body.appendChild(container);
        injectPdfEngine();

        // Kiểm tra kết nối form
        document.getElementById('v13-btn-test').addEventListener('click', function() {
            const fields = ['date', 'amount', 'to', 'from', 'ref', 'detail'];
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
            logMessage(`Đã tìm thấy ${foundCount}/6 ô.`);
        });

        document.getElementById('v13-btn-file').addEventListener('click', function() {
            if (!pdfLibLoaded) { alert("Vui lòng đợi giây lát, lõi PDF đang kết nối!"); return; }
            document.getElementById('v13-file-input').click();
        });

        // Xử lý đọc & tự động điền form
        document.getElementById('v13-file-input').addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file || !pdfLibLoaded) return;
            updateStatus("⏳ Đang xử lý...", "#ff9e64");
            logMessage(`--- File: ${file.name} ---`);

            try {
                const nutUploadOdoo = document.querySelector('input[type="file"]:not(#v13-file-input)');
                if (nutUploadOdoo) {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    nutUploadOdoo.files = dataTransfer.files;
                    nutUploadOdoo.dispatchEvent(new Event('change', { bubbles: true }));
                    logMessage("✓ Đã đính kèm tệp.");
                }
            } catch (errUpload) {}

            try {
                const vanBanRaw = await xuLyDocFilePDF(file);
                const data = trichXuatDuLieuBIDV(vanBanRaw);

                logMessage(`>>> LOẠI: ${data.loaiGiaoDich} <<<`);
                logMessage(`✓ Ngày: ${data.ngay || 'Trống'}`);
                logMessage(`✓ Số tiền: ${data.soTien || 'Trống'}`);
                logMessage(`✓ From: ${data.fromAccount || 'Trống'}`);
                logMessage(`✓ To: ${data.toAccount || 'Trống'}`);
                logMessage(`✓ Ref: ${data.ref || 'Trống'}`);
                logMessage(`✓ Diễn giải: ${data.detail || 'Trống'}`);

                let demForm = 0;

                // THAY ĐỔI QUAN TRỌNG: Gọi đồng bộ cho cả 6 trường để cập nhật hoặc xóa trống triệt để
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('date'), data.ngay)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('amount'), data.soTien)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('detail'), data.detail)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('from'), data.fromAccount)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('to'), data.toAccount)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('ref'), data.ref)) demForm++;

                if (demForm > 0) {
                    updateStatus(`🎉 HOÀN THÀNH (${demForm} field)`, "#9ece6a");
                    logMessage(`→ Đồng bộ dữ liệu phiếu thành công.`);
                } else {
                    updateStatus("⚠️ Lỗi dữ liệu form", "#f7768e");
                }
            } catch (error) {
                updateStatus("❌ Lỗi hệ thống", "#f7768e");
                logMessage(`Lỗi: ${error.message}`);
            }
            e.target.value = '';
        });
    }

    function updateStatus(text, color) {
        const el = document.getElementById('v13-status');
        if (el) { el.innerText = text; el.style.color = color; }
    }

    function logMessage(msg) {
        const el = document.getElementById('v13-log');
        if (el) { el.innerHTML += `<br/>${msg}`; el.scrollTop = el.scrollHeight; }
    }

    if (document.body) veBangDieuKhien();
    else document.addEventListener('DOMContentLoaded', veBangDieuKhien);

    const observer = new MutationObserver(() => {
        if (!document.getElementById('odoo-autofill-v13-combo') && document.body) veBangDieuKhien();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

})();
