// ==UserScript==
// @name         Viettin Bank
// @namespace    http://tampermonkey.net/
// @version      9.9
// @description  Tối ưu hóa hiệu năng, sửa lỗi vòng lặp DOM và nâng cấp độ chính xác quét dữ liệu VietinBank điền vào Odoo.
// @author       NGOCCHUNG
// @downloadURL  https://raw.githubusercontent.com/chungdang-hub/bank-userscripts/main/Viettin-Bank.user.js
// @updateURL    https://raw.githubusercontent.com/chungdang-hub/bank-userscripts/main/Viettin-Bank.user.js
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

    // 2. THUẬT TOÁN ĐA TẦNG QUÉT Ô INPUT ODOO (ƯU TIÊN TUYỆT ĐỐI TEXTAREA#DETAIL)
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

    // 3. ĐỒNG BỘ DỮ LIỆU ĐA NĂNG VÀO FRAMEWORK ODOO / TEXTAREA
    function ghiDuLieuVaoOdoo(element, giaTri) {
        if (!element || !giaTri) return false;
        try {
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                element.focus();

                // Gán giá trị chuẩn cho cả input thường lẫn textarea của Odoo
                const prototype = element.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
                const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
                setter.call(element, giaTri);

                element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

                // Giả lập nhấn Enter
                element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 }));
            } else {
                element.textContent = giaTri;
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }

            element.style.backgroundColor = 'rgba(26, 188, 156, 0.2)';
            setTimeout(() => { element.style.backgroundColor = ''; }, 2000);
            return true;
        } catch (e) { return false; }
    }

    // 4. PHÂN TÍCH CHUỖI THÔNG TIN
    function trichXuatDuLieuVietinBank(vanBan) {
        let ketQua = { ngay: '', soTien: '', ref: '', fromAccount: '', toAccount: '', detail: '' };
        const textChuan = vanBan.replace(/\s+/g, ' ');

        const mRef = textChuan.match(
            /Transaction number[\s:]*([A-Z0-9-]{10,})/i
        );

        if (mRef) {
            ketQua.ref = mRef[1].trim();
        }

        // Quét Ngày
        const mNgay = textChuan.match(/(?:Ngày thực hiện|Transaction date).*?:\s*(\d{2}[-\/]\d{2}[-\/]\d{4})/i);
        if (mNgay) ketQua.ngay = mNgay[1].replace(/-/g, '/');

        // Quét Số tiền
        const start = textChuan.search(/(?:Số tiền bằng số|Amount in figures)/i);

        if (start !== -1) {

            const block = textChuan.substring(start, start + 200);

            const m = block.match(/[:\s]*([\d]{1,3}(?:,\d{3})*(?:\.\d+)?)/);

            if (m) {
                ketQua.soTien = m[1];
            }
        }

        // BỘ QUÉT NỘI DUNG GIAO DỊCH (DETAIL) v9.8
        const boLocDetail = [

            /(?:Nội dung\s*Remarks|Nội dung|Remarks)[\s:]*([\s\S]*?)(?=\s*(?:Kênh chuyển tiền|Channel|In từ dịch vụ|Date printed|$))/i,

            /(?:Remarks)[\s:]*([\s\S]*?)(?=\s*(?:Channel|Date printed|$))/i

        ];
        for (let i = 0; i < boLocDetail.length; i++) {
            let m = textChuan.match(boLocDetail[i]);
            if (m && m[1]) {
                let noiDungTho = m[1].trim();
                noiDungTho = noiDungTho.replace(/^Remarks\s*/i, '').trim();
                ketQua.detail = noiDungTho;
                break;
            }
        }

        // Quét Tài khoản
        const viTriChia = textChuan.search(/Người thụ hưởng|Beneficiary/i);
        if (viTriChia !== -1) {
            const doanNguon = textChuan.substring(0, viTriChia);
            const doanDich = textChuan.substring(viTriChia);
            const mNguon = doanNguon.match(
                /From account number[\s:]*([0-9]{6,20})/i
            );
            if (mNguon) ketQua.fromAccount = mNguon[1].trim();
            const mDich = doanDich.match(
                /To account number[\s:]*([0-9]{6,20})/i
            );
            if (mDich) ketQua.toAccount = mDich[1].trim();
        } else {
            const mNguon = textChuan.match(/(?:Số tài khoản|From account number).*?:\s*([0-9]+)/i);
            if (mNguon) ketQua.fromAccount = mNguon[1].trim();
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

    // 6. KHỞI TẠO BẢNG ĐIỀU KHIỂN NỔI v9.8
    function veBangDieuKhien() {
        if (document.getElementById('odoo-autofill-v9')) return;

        const container = document.createElement('div');
        container.id = 'odoo-autofill-v9';
        container.style = `
            position: fixed; top: 90px; right: 20px; z-index: 1000000;
            background: #1a1b26; color: #a9b1d6; padding: 15px;
            border-radius: 8px; width: 260px; font-family: sans-serif;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 2px solid #00b894;
        `;

        container.innerHTML = `
            <div style="font-weight: bold; color: #00b894; font-size: 13px; margin-bottom: 6px; text-align: center; border-bottom: 1px solid #444b6a; padding-bottom: 4px;">
                🦊 VIETTIN BANK AUTOFILL
            </div>
            <div id="v9-status" style="font-size: 11px; color: #9ece6a; font-weight: bold; margin-bottom: 10px; text-align: center;">
                ● Hệ thống đã sẵn sàng
            </div>

            <button id="v9-btn-test" style="width: 100%; background: #24283b; color: #7aa2f7; border: 1px solid #7aa2f7; padding: 7px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; margin-bottom: 8px;">
                🔍 KIỂM TRA KẾT NỐI FORM ODOO
            </button>

            <button id="v9-btn-file" style="width: 100%; background: #00b894; color: #1a1b26; border: none; padding: 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">
                📁 CHỌN FILE VIETTINBANK
            </button>
            <input type="file" id="v9-file-input" accept="application/pdf" style="display: none;" />

            <div id="v9-log" style="font-size: 10px; color: #a9b1d6; margin-top: 10px; max-height: 120px; overflow-y: auto; background: #10101a; padding: 6px; border-radius: 4px; border: 1px solid #24283b; line-height: 1.4;">
                HƯỚNG DẪN: Bản v9.8 mượt mà, tối ưu hóa bộ nhớ DOM và tiến trình xử lý PDF.
            </div>
        `;

        document.body.appendChild(container);
        injectPdfEngine();

        // Kiểm tra kết nối form
        document.getElementById('v9-btn-test').addEventListener('click', function() {
            const fields = ['date', 'ref', 'amount', 'from', 'to', 'detail'];
            let foundCount = 0;
            logMessage("--- Quét kết nối Form Odoo ---");

            fields.forEach(f => {
                let el = timInputOdooTheoLabel(f);
                if (el) {
                    foundCount++;
                    el.style.backgroundColor = '#ffeaa7';
                    setTimeout(() => { el.style.backgroundColor = ''; }, 2000);
                    logMessage(`✓ Kết nối thành công: [${f.toUpperCase()}]`);
                } else {
                    logMessage(`❌ Không tìm thấy ô: [${f.toUpperCase()}]`);
                }
            });
            logMessage(`Kết quả: Đã tìm thấy ${foundCount}/6 ô.`);
        });

        document.getElementById('v9-btn-file').addEventListener('click', function() {
            if (!pdfLibLoaded) {
                alert("Lõi xử lý PDF chưa tải xong. Vui lòng đợi trong giây lát!");
                return;
            }
            document.getElementById('v9-file-input').click();
        });

        // Đọc file và tự động điền form tổng hợp
        document.getElementById('v9-file-input').addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file || !pdfLibLoaded) return;

            updateStatus("⏳ Đang xử lý tự động...", "#ff9e64");
            logMessage(`--- Xử lý file: ${file.name} ---`);

            // Đính kèm file gốc lên hệ thống Odoo
            try {
                const nutUploadOdoo = document.querySelector('input[type="file"]:not(#v9-file-input)');
                if (nutUploadOdoo) {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    nutUploadOdoo.files = dataTransfer.files;
                    nutUploadOdoo.dispatchEvent(new Event('change', { bubbles: true }));
                    logMessage("✓ Đã đồng bộ đính kèm file lên Odoo.");
                }
            } catch (errUpload) {}

            // Trích xuất văn bản PDF và điền form
            try {
                const vanBanRaw = await xuLyDocFilePDF(file);
                const data = trichXuatDuLieuVietinBank(vanBanRaw);

                logMessage(`✓ Đọc Số tiền (Amount): ${data.soTien || 'Không thấy'}`);
                logMessage(`✓ Đọc Mã Ref: ${data.ref || 'Không thấy'}`);
                logMessage(`✓ Đọc Nội dung (Detail): ${data.detail || 'Không thấy'}`);

                let demForm = 0;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('date'), data.ngay)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('ref'), data.ref)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('amount'), data.soTien)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('detail'), data.detail)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('from'), data.fromAccount)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('to'), data.toAccount)) demForm++;

                if (demForm > 0) {
                    updateStatus(`🎉 TRỌN VẸN (${demForm}/6)`, "#9ece6a");
                    logMessage(`→ Hoàn thành mỹ mãn! Đã tự điền ${demForm} mục dữ liệu.`);
                } else {
                    updateStatus("⚠️ Lỗi điền dữ liệu", "#f7768e");
                }
            } catch (error) {
                updateStatus("❌ Lỗi hệ thống", "#f7768e");
                logMessage(`Lỗi: ${error.message || error}`);
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

    // Khởi chạy an toàn bằng cách giảm thiểu vòng lặp setInterval cũ
    if (document.body) {
        veBangDieuKhien();
    } else {
        document.addEventListener('DOMContentLoaded', veBangDieuKhien);
    }

    // Bảo vệ giao diện: Chỉ vẽ lại khi Odoo chuyển trang (SPA) làm mất widget UI
    const observer = new MutationObserver(() => {
        if (!document.getElementById('odoo-autofill-v9') && document.body) {
            veBangDieuKhien();
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

})();
