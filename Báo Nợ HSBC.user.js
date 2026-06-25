// ==UserScript==
// @name         Báo Nợ HSBC
// @namespace    http://tampermonkey.net/
// @version      19.3
// @description  Hỗ trợ đa định dạng HSBC (Báo Nợ): Tích hợp luồng xử lý song song cho cả Ủy nhiệm chi tiêu chuẩn & Giải ngân Tài trợ thương mại (Trade Loan)
// @downloadURL  https://raw.githubusercontent.com/chungdang-hub/bank-userscripts/main/Bao-No-HSBC.user.js
// @updateURL    https://raw.githubusercontent.com/chungdang-hub/bank-userscripts/main/Bao-No-HSBC.user.js
// @author       NGOCCHUNG
// @match        *://farmlink.techcoop.vn/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const FROM_ACCOUNT_CO_DINH = "090688433001";
    let pdfLibLoaded = false;

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
        script.onerror = () => { updateStatus("❌ Lỗi bảo mật trình duyệt", "#f7768e"); };
        document.head.appendChild(script);
    }

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

            if (chuoiLabel === 'date' && (text === 'date' || text === 'ngày')) khớp = true;
            if (chuoiLabel === 'ref' && (text === 'ref' || text === 'mã giao dịch' || text === 'mã ref')) khớp = true;
            if (chuoiLabel === 'amount' && (text === 'amount' || text === 'số tiền')) khớp = true;
            if (chuoiLabel === 'detail' && (text === 'detail' || text.includes('nội dung') || text.includes('ghi chú') || text === 'diễn giải')) khớp = true;
            if (chuoiLabel === 'from' && (text.includes('from account') || text.includes('tài khoản nguồn') || text.includes('tài khoản đi')) && !text.includes('name') && !text.includes('tên')) khớp = true;
            if (chuoiLabel === 'to' && (text.includes('to account') || text.includes('tài khoản đích') || text.includes('tài khoản đến')) && !text.includes('name') && !text.includes('tên')) khớp = true;

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

    function ghiDuLieuVaoOdoo(element, giaTri) {
        if (!element || giaTri === undefined || giaTri === null || giaTri === "") return false;
        try {
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                element.focus();
                const prototype = element.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
                const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
                setter.call(element, giaTri);

                element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                element.dispatchEvent(new Event('blur', { bubbles: true }));
            } else {
                element.textContent = giaTri;
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }

            element.style.backgroundColor = 'rgba(0, 229, 255, 0.2)';
            setTimeout(() => { element.style.backgroundColor = ''; }, 2000);
            return true;
        } catch (e) { return false; }
    }

    // [LÕI MỚI v19.3]: BỘ PHÂN TÍCH KÉP (DUAL-PARSER ENGINE)
    function trichXuatDuLieuHSBC_BaoNo(vanBan) {
        let ketQua = { ngay: '', soTien: '', ref: '', fromAccount: FROM_ACCOUNT_CO_DINH, toAccount: '', detail: '' };

        // 1. Chuẩn hóa làm phẳng chuỗi
        let textChuan = vanBan.replace(/"\s*,\s*"/g, ' ');
        textChuan = textChuan.replace(/["\r\n]+/g, ' ');
        textChuan = textChuan.replace(/\s+/g, ' ').trim();

        // 2. Quét Tài khoản Nguồn
        const mFromAcc = textChuan.match(/Số tài khoản\s+([\d-]+)/i);
        if (mFromAcc) ketQua.fromAccount = mFromAcc[1].replace(/-/g, '').trim();

        // 3. Quét Tài khoản Đích (Hỗ trợ cả cụm F1 và F2)
        const mToAcc = textChuan.match(/(?:Tài khoản thụ hưởng|Tài khoản với ngân hàng)\s*[:\-#]?\s*([0-9]{8,16})/i);
        if (mToAcc) ketQua.toAccount = mToAcc[1].trim();

        // 4. Quét Mã Ref (VƯỢT BẪY KHOẢNG TRẮNG: Nhận diện các mã như 'TT VNM6037CT N')
        const mRef = textChuan.match(/Mã tham chiếu ngân(?: hàng)?\s+([A-Z0-9_-\s]{4,25}?)(?=\s+Mã tham chiếu|\s+Chú giải|\s+Chủ giải|\s+Loại tiền tệ|\s+Chi tiết|$)/i) ||
                     textChuan.match(/Mã tham chiếu khách hàng\s+([A-Z0-9_-\s]{4,25}?)(?=\s+Mã tham chiếu|\s+Chú giải|\s+Chủ giải|\s+Loại tiền tệ|\s+Chi tiết|$)/i) ||
                     textChuan.match(/Mã tham chiếu xuyên suốt\s+([A-Z0-9_-]+)/i);
        if (mRef) ketQua.ref = mRef[1].trim();

        // 5. Quét Số tiền (Tự động nhận diện 'Số tiền ròng VND 412...' của F2 và 'VND-196...' của F1)
        let chuoiTien = "";
        const mSoTien = textChuan.match(/(?:Số tiền ròng|Số tiền ghi nợ|Số tiền đã ghi nợ|Số tiền thanh toán)\s*(?::\s*)?(?:VND)?\s*(-?\s*[\d,.]+)/i) ||
                        textChuan.match(/VND\s*-\s*([\d,.]+)/i);
        if (mSoTien) {
            chuoiTien = mSoTien[1].replace(/-/g, '').trim();
            ketQua.soTien = chuoiTien.replace(/\.00$/, '');
        }

        // 6. Quét Diễn giải (GIẢI THUẬT CÂN BẰNG TỰ ĐỘNG GIỮA CHI TIẾT & CHÚ GIẢI)
        let chitiet = "";
        const mCT = textChuan.match(/Chi tiết thanh toán\s+([\s\S]*?)(?=Tên người thụ hưởng|Tài khoản thụ hưởng|Mã tham chiếu|Ngày hiệu lực|Thông tin giữa|$)/i);
        if (mCT && !mCT[1].includes("Không có sẵn")) {
            // Gọt bỏ rác do trộn cột SWIFT của F2
            chitiet = mCT[1].replace(/(?:Địa chỉ|VIETNAM JSC|Tên|Ngân hàng)[\s\S]*/gi, '').trim();
        }

        let chugiai = "";
        const mCG = textChuan.match(/(?:Chú giải bổ sung|Chủ giải bổ sung)\s+([\s\S]*?)(?=Mã tham chiếu|Chi tiết thanh toán|Tên người thụ hưởng|Chi tiết ghi nợ|$)/i);
        if (mCG) { chugiai = mCG[1].trim(); }

        // Logic chọn: Nếu 'Chi tiết' bị rỗng hoặc gọt bớt chỉ còn dưới 15 ký tự -> Lấy 'Chú giải' (chứa mã Trade Loan).
        let detailChuan = (chitiet.length > 15) ? chitiet : chugiai;
        if (!detailChuan) detailChuan = chugiai || chitiet;

        if (detailChuan) {
            detailChuan = detailChuan.replace(/(?:Tên người thụ hưởng|Tài khoản thụ hưởng|Số tiền đã trả|Số tiền đã ghi nợ|Tỷ giá hối đoái|Ngày hiệu lực|Thông tin giữa các ngân hàng)[\s\S]*/gi, '');
            ketQua.detail = detailChuan.trim();
        }

        // 7. Quét Ngày giao dịch
        const mNgay = textChuan.match(/(?:Ngày hiệu lực|Thông tin chi tiết vào)\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
        if (mNgay) {
            const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
            let day = mNgay[1].padStart(2, '0');
            let mon = months[mNgay[2].toLowerCase()];
            ketQua.ngay = `${day}/${mon}/${mNgay[3]}`;
        }

        return ketQua;
    }

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

    function veBangDieuKhienBaoNo() {
        if (document.getElementById('odoo-autofill-debit')) return;

        const container = document.createElement('div');
        container.id = 'odoo-autofill-debit';
        container.style = `
            position: fixed; top: 370px; right: 20px; z-index: 1000000;
            background: #1a1b26; color: #a9b1d6; padding: 15px;
            border-radius: 8px; width: 260px; font-family: sans-serif;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 2px solid #00e5ff;
        `;

        container.innerHTML = `
            <div style="font-weight: bold; color: #00e5ff; font-size: 13px; margin-bottom: 6px; text-align: center; border-bottom: 1px solid #444b6a; padding-bottom: 4px;">
                💸 BÁO NỢ HSBC AUTOFILL
            </div>
            <div id="debit-status" style="font-size: 11px; color: #9ece6a; font-weight: bold; margin-bottom: 10px; text-align: center;">
                ● Sẵn sàng (v19.3 Dual-Engine)
            </div>
            <button id="debit-btn-test" style="width: 100%; background: #24283b; color: #00e5ff; border: 1px solid #00e5ff; padding: 7px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; margin-bottom: 8px;">
                🔍 KIỂM TRA FORM ODOO
            </button>
            <button id="debit-btn-file" style="width: 100%; background: #00e5ff; color: #1a1b26; border: none; padding: 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">
                📁 CHỌN FILE BÁO NỢ HSBC
            </button>
            <input type="file" id="debit-file-input" accept="application/pdf" style="display: none;" />
            <div id="debit-log" style="font-size: 10px; color: #a9b1d6; margin-top: 10px; max-height: 120px; overflow-y: auto; background: #10101a; padding: 6px; border-radius: 4px; border: 1px solid #24283b; line-height: 1.4;">
                [v19.3]: Tự động nhận diện & bẻ nhánh xử lý giữa chuyển khoản thường và Giải ngân Trade Loan.
            </div>
        `;

        document.body.appendChild(container);
        injectPdfEngine();

        document.getElementById('debit-btn-test').addEventListener('click', function() {
            const fields = ['date', 'ref', 'amount', 'from', 'to', 'detail'];
            let foundCount = 0;
            logMessage("--- Kiểm tra form ---");
            fields.forEach(f => {
                let el = timInputOdooTheoLabel(f);
                if (el) {
                    foundCount++;
                    el.style.backgroundColor = '#ffeaa7';
                    setTimeout(() => { el.style.backgroundColor = ''; }, 2000);
                    logMessage(`✓ Khớp: [${f.toUpperCase()}]`);
                } else { logMessage(`❌ Trượt: [${f.toUpperCase()}]`); }
            });
            logMessage(`Đã tìm thấy ${foundCount}/6 ô.`);
        });

        document.getElementById('debit-btn-file').addEventListener('click', function() {
            if (!pdfLibLoaded) { alert("Vui lòng đợi giây lát, lõi PDF đang kết nối!"); return; }
            document.getElementById('debit-file-input').click();
        });

        document.getElementById('debit-file-input').addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file || !pdfLibLoaded) return;

            updateStatus("⏳ Đang xử lý...", "#ff9e64");
            logMessage(`--- File: ${file.name} ---`);

            try {
                const nutUploadOdoo = document.querySelector('input[type="file"]:not(#debit-file-input):not(#v9-file-input)');
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
                const data = trichXuatDuLieuHSBC_BaoNo(vanBanRaw);

                logMessage(`✓ Ngày: ${data.ngay || 'Trống'}`);
                logMessage(`✓ Số tiền chi: ${data.soTien || 'Trống'}`);
                logMessage(`✓ Mã Ref: ${data.ref || 'Trống'}`);
                logMessage(`✓ Nguồn (From): ${data.fromAccount}`);
                logMessage(`✓ Đích (To): ${data.toAccount || 'Trống (Odoo tự map theo Partner)'}`);
                logMessage(`✓ Diễn giải: ${data.detail || 'Trống'}`);

                let demForm = 0;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('date'), data.ngay)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('ref'), data.ref)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('amount'), data.soTien)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('detail'), data.detail)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('from'), data.fromAccount)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('to'), data.toAccount)) demForm++;

                if (demForm > 0) {
                    updateStatus(`🎉 HOÀN THÀNH (${demForm}/6)`, "#00e5ff");
                    logMessage(`→ Điền Báo Nợ thành công.`);
                } else { updateStatus("⚠️ Lỗi dữ liệu form", "#f7768e"); }
            } catch (error) {
                updateStatus("❌ Lỗi hệ thống", "#f7768e");
                logMessage(`Lỗi: ${error.message}`);
            }
            e.target.value = '';
        });
    }

    function updateStatus(text, color) {
        const el = document.getElementById('debit-status');
        if (el) { el.innerText = text; el.style.color = color; }
    }

    function logMessage(msg) {
        const el = document.getElementById('debit-log');
        if (el) { el.innerHTML += `<br/>${msg}`; el.scrollTop = el.scrollHeight; }
    }

    if (document.body) veBangDieuKhienBaoNo();
    else document.addEventListener('DOMContentLoaded', veBangDieuKhienBaoNo);

    const observer = new MutationObserver(() => {
        if (!document.getElementById('odoo-autofill-debit') && document.body) veBangDieuKhienBaoNo();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

})();