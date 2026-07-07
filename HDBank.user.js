// ==UserScript==
// @name         HDBank
// @namespace    http://tampermonkey.net
// @version      13.4
// @author       NGOCCHUNG
// @downloadURL  https://raw.githubusercontent.com/chungdang-hub/bank-userscripts/main/HDBank.user.js
// @updateURL    https://raw.githubusercontent.com/chungdang-hub/bank-userscripts/main/HDBank.user.js
// @match        *://farmlink.techcoop.vn/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    let pdfLibLoaded = false;
    let isInjecting = false;

    // 1. TỰ ĐỘNG NHÚNG LÕI XỬ LÝ PDF BẰNG THẺ TIÊU CHUẨN
    function injectPdfEngine() {
        if (window.pdfjsLib || isInjecting) {
            if (window.pdfjsLib) {
                pdfLibLoaded = true;
                updateStatus("● Lõi PDF đã sẵn sàng", "#9ece6a");
            }
            return;
        }
        isInjecting = true;
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
        script.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
            pdfLibLoaded = true;
            updateStatus("● Lõi PDF đã sẵn sàng", "#9ece6a");
            logMessage("✓ Thư viện PDF đã kết nối.");
        };
        script.onerror = () => {
            isInjecting = false;
            updateStatus("❌ Lỗi tải thư viện PDF", "#f7768e");
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
            'date': ['date', 'date_transaction', 'booking_date'],
            'ref': ['ref', 'name', 'reference', 'payment_reference'],
            'amount': ['amount', 'amount_total', 'price_total', 'payment_amount'],
            'from': ['from_account', 'x_from_account', 'partner_bank_id'],
            'to': ['to_account', 'x_to_account', 'journal_id'],
            'detail': ['detail', 'narration', 'note', 'comment', 'communication']
        };

        if (nameMap[chuoiLabel]) {
            for (let n of nameMap[chuoiLabel]) {
                let el = document.querySelector(`input[name="${n}"], textarea[name="${n}"], [name="${n}"] textarea, [name*="${n}"] textarea, select[name="${n}"]`);
                if (el) return el;
            }
        }

        const tatCaLabels = Array.from(document.querySelectorAll('label, .o_form_label, .o_cell span'));
        for (let label of tatCaLabels) {
            const text = label.textContent.trim().toLowerCase();
            let khớp = false;

            if (chuoiLabel === 'date' && (text === 'date' || text.includes('ngày'))) khớp = true;
            if (chuoiLabel === 'ref' && (text === 'ref' || text.includes('mã lệnh') || text.includes('số lệnh'))) khớp = true;
            if (chuoiLabel === 'amount' && (text === 'amount' || text.includes('số tiền'))) khớp = true;
            if (chuoiLabel === 'detail' && (text.includes('detail') || text.includes('nội dung') || text.includes('ghi chú'))) khớp = true;
            if (chuoiLabel === 'from' && (text.includes('from account') || text.includes('tài khoản chuyển'))) khớp = true;
            if (chuoiLabel === 'to' && (text.includes('to account') || text.includes('tài khoản nhận'))) khớp = true;

            if (khớp) {
                if (label.getAttribute('for')) {
                    let input = document.getElementById(label.getAttribute('for'));
                    if (input) return input;
                }
                let oChuaLabel = label.closest('.o_cell') || label.closest('.o_inner_group') || label.parentElement;
                if (oChuaLabel) {
                    let inputTrongO = oChuaLabel.querySelector('input, textarea, select');
                    if (inputTrongO) return inputTrongO;

                    let oKeTiep = oChuaLabel.nextElementSibling;
                    if (oKeTiep) {
                        let inputKe = oKeTiep.querySelector('input, textarea, select');
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
            element.focus();

            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                const prototype = element.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
                const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
                setter.call(element, giaTri);

                element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                // Đã bỏ lệnh giả lập ấn phím Enter tại đây
                element.blur();
            } else {
                element.value = giaTri;
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }

            element.style.backgroundColor = 'rgba(26, 188, 156, 0.3)';
            setTimeout(() => { element.style.backgroundColor = ''; }, 2000);
            return true;
        } catch (e) { return false; }
    }

    // 4. PHÂN TÍCH CHUỖI THÔNG TIN HDBANK THÔNG THƯỜNG
    function trichXuatHDBank_ThongThuong(vanBan) {
        let ketQua = { ngay: '', soTien: '', ref: '', fromAccount: '', toAccount: '', detail: '' };

        const textXuongDong = vanBan.replace(/[ \t]+/g, ' ');
        const textChuan = vanBan.replace(/\s+/g, ' ');

        const mNgay = textChuan.match(/(?:Ngày hiệu lực|Effective Date|Ngày giao dịch)\s*["\s,:]*(\d{2}\/\d{2}\/\d{4})/i);
        if (mNgay) ketQua.ngay = mNgay[1];

        const mRef = textXuongDong.match(/(?:Số giao dịch|Order Number|Số lệnh giao dịch|Mã giao dịch)[\s\S]*?["\s,:-]+(\d{5,15})\b/i);
        if (mRef) ketQua.ref = mRef[1].trim();

        const mSoTien = textChuan.match(/(?:Số tiền|Amount)\s*["\s,:]*([\d,.]+)\s*(?:VND|VND|đồng)/i);
        if (mSoTien) ketQua.soTien = mSoTien[1].replace(/,/g, '');

        const mDetail = textChuan.match(/(?:Nội dung chuyển khoản|Nội dung|Details of Payment)\s*["\s,:]*(.*?)(?=\s*(?:Cám ơn quý khách|Thank you|Lưu ý|Note|Tên ngân hàng nhận|$))/i);
        if (mDetail) {
            let noiDungTho = mDetail[1].trim();
            noiDungTho = noiDungTho.replace(/^["\s,:]+/, '').replace(/["\s,]+$/, '');
            noiDungTho = noiDungTho.replace(/^(?:VND|đồng)\s*/i, '');
            ketQua.detail = noiDungTho;
        }

        const mFromCard = textChuan.match(/(?:Số thẻ chuyển đến|Card Number|Từ tài khoản|Số tài khoản trích xuất)\s*["\s,:]*(\d+)/i);
        if (mFromCard) ketQua.fromAccount = mFromCard[1].trim();

        const mToAccount = textChuan.match(/(?:Số tài khoản|Account Number|Tài khoản hưởng thụ|Đến tài khoản)\s*(?:Loại tiền\s*Currency\s*)?["\s,:]*(\d+)/i);
        if (mToAccount) ketQua.toAccount = mToAccount[1].trim();

        if (!ketQua.fromAccount || !ketQua.toAccount) {
            const regexSTK = /\b\d{6,16}\b/g;
            const tatCaSo = textChuan.match(regexSTK);
            if (tatCaSo) {
                const stks = tatCaSo.filter(so => so !== ketQua.ref && so !== '19006060');
                if (!ketQua.fromAccount && stks.length >= 1) ketQua.fromAccount = stks[0];
                if (!ketQua.toAccount && stks.length >= 2) ketQua.toAccount = stks[1];
            }
        }

        return ketQua;
    }

    // 5. PHÂN TÍCH CHUỖI THÔNG TIN HDBANK GIẢI NGÂN
    function trichXuatHDBank_GiaiNgan(vanBan) {
        let ketQua = { ngay: '', soTien: '', ref: '', fromAccount: '', toAccount: '', detail: '' };

        const textChuan = vanBan.replace(/"/g, '').replace(/\s+/g, ' ');

        const mNgay = textChuan.match(/(?:Ngày hiệu lực|Effective Date)\s*(\d{2}\/\d{2}\/\d{4})/i);
        if (mNgay) ketQua.ngay = mNgay[1];

        const mRef = textChuan.match(/(?:Số giao dịch|Order Number)\s*(\d+)/i);
        if (mRef) ketQua.ref = mRef[1].trim();

        const mFrom = textChuan.match(/(?:Số tài khoản|Account Number)\s*Loại tiền\s*Currency\s*(\d+)/i) || textChuan.match(/(?:Account Number)\s*(\d+)/i);
        if (mFrom) ketQua.fromAccount = mFrom[1].trim();

        const mTo = textChuan.match(/Loại tiền\s*VND\s*(\d+)\s*Currency\s*Vietcombank/i) || textChuan.match(/VND\s*(\d+)\s*Currency\s*Vietcombank/i);
        if (mTo) {
            ketQua.toAccount = mTo[1].trim();
        } else {
            const tatCaSo = textChuan.match(/\b\d{9,15}\b/g) || [];
            const danhSachSoHopLe = tatCaSo.filter(so => so !== '19006060' && so !== ketQua.ref && so !== ketQua.fromAccount);
            if (danhSachSoHopLe.length > 0) ketQua.toAccount = danhSachSoHopLe[0];
        }

        const danhSachSoTien = textChuan.match(/(\d{1,3}(?:,\d{3})+)\s*VND/gi);
        if (danhSachSoTien && danhSachSoTien.length > 0) {
            const cleanAmount = danhSachSoTien[danhSachSoTien.length - 1].match(/[\d,.]+/);
            if (cleanAmount) ketQua.soTien = cleanAmount[0].replace(/,/g, '');
        }

        const mDetailBackup = textChuan.match(/(?:THANH TOAN CHO HOA DON.*?)(?=\s*(?:VN|Cám ơn|$))/i);
        if (mDetailBackup) ketQua.detail = mDetailBackup[0].trim();

        return ketQua;
    }

    // 6. ĐỌC FILE PDF
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
            reader.onerror = (err) => reject(err);
            reader.readAsArrayBuffer(file);
        });
    }

    // 7. KHỞI TẠO BẢNG ĐIỀU KHIỂN NỔI
    function veBangDieuKhien() {
        if (document.getElementById('odoo-autofill-hdbank-aio')) return;

        const container = document.createElement('div');
        container.id = 'odoo-autofill-hdbank-aio';
        container.style.cssText = `
            position: fixed; top: 90px; right: 20px; z-index: 2147483647;
            background: #1a1b26; color: #a9b1d6; padding: 15px;
            border-radius: 8px; width: 270px; font-family: sans-serif;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 2px solid #7aa2f7;
            transition: all 0.3s ease;
        `;

        container.innerHTML = `
            <div style="font-weight: bold; color: #7aa2f7; font-size: 13px; margin-bottom: 6px; text-align: center; border-bottom: 1px solid #444b6a; padding-bottom: 4px;">
                🦊 HDBANK AUTOFILL
            </div>
            <div id="aio-status" style="font-size: 11px; color: #9ece6a; font-weight: bold; margin-bottom: 10px; text-align: center;">
                ● Hệ thống đã sẵn sàng
            </div>
            <button id="aio-btn-test" style="width: 100%; background: #24283b; color: #7aa2f7; border: 1px solid #7aa2f7; padding: 7px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; margin-bottom: 8px;">
                🔍 KIỂM TRA KẾT NỐI FORM ODOO
            </button>
            <button id="aio-btn-file" style="width: 100%; background: #7aa2f7; color: #1a1b26; border: none; padding: 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">
                📁 CHỌN FILE HDBANK
            </button>
            <input type="file" id="aio-file-input" accept="application/pdf" style="display: none;" />
            <div id="aio-log" style="font-size: 10px; color: #a9b1d6; margin-top: 10px; max-height: 140px; overflow-y: auto; background: #10101a; padding: 6px; border-radius: 4px; border: 1px solid #24283b; line-height: 1.4;">
                Tải lên file PDF bất kỳ (Báo Có/Nợ/Giải Ngân). Hệ thống sẽ tự nhận diện cấu trúc.
            </div>
        `;

        (document.body || document.documentElement).appendChild(container);

        injectPdfEngine();

        document.getElementById('aio-btn-test').addEventListener('click', function() {
            const fields = ['date', 'ref', 'amount', 'from', 'to', 'detail'];
            let foundCount = 0;
            logMessage("--- Quét form Odoo ---");
            fields.forEach(f => {
                let el = timInputOdooTheoLabel(f);
                if (el) {
                    foundCount++;
                    el.style.backgroundColor = '#ffeaa7';
                    setTimeout(() => { el.style.backgroundColor = ''; }, 2000);
                    logMessage(`✓ Tốt: [${f.toUpperCase()}]`);
                } else {
                    logMessage(`❌ Thiếu: [${f.toUpperCase()}]`);
                }
            });
        });

        document.getElementById('aio-btn-file').addEventListener('click', function() {
            if (!pdfLibLoaded) {
                alert("Lõi xử lý PDF chưa tải xong. Vui lòng đợi trong giây lát!");
                injectPdfEngine();
                return;
            }
            document.getElementById('aio-file-input').click();
        });

        document.getElementById('aio-file-input').addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file || !pdfLibLoaded) return;

            updateStatus("⏳ Đang nhận diện...", "#ff9e64");
            logMessage(`Đang xử lý: ${file.name}`);

            try {
                const nutUploadOdoo = document.querySelector('input[type="file"]:not(#aio-file-input)');
                if (nutUploadOdoo) {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    nutUploadOdoo.files = dataTransfer.files;
                    nutUploadOdoo.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } catch (err) {}

            try {
                const vanBanRaw = await xuLyDocFilePDF(file);
                let data = /THANH TOAN CHO HOA DON/i.test(vanBanRaw) ? trichXuatHDBank_GiaiNgan(vanBanRaw) : trichXuatHDBank_ThongThuong(vanBanRaw);

                logMessage(`Tiền: ${data.soTien || '-'} | Ref: ${data.ref || '-'}`);

                let demForm = 0;
                if (data.ngay && ghiDuLieuVaoOdoo(timInputOdooTheoLabel('date'), data.ngay)) demForm++;
                if (data.ref && ghiDuLieuVaoOdoo(timInputOdooTheoLabel('ref'), data.ref)) demForm++;
                if (data.soTien && ghiDuLieuVaoOdoo(timInputOdooTheoLabel('amount'), data.soTien)) demForm++;
                if (data.detail && ghiDuLieuVaoOdoo(timInputOdooTheoLabel('detail'), data.detail)) demForm++;
                if (data.fromAccount && ghiDuLieuVaoOdoo(timInputOdooTheoLabel('from'), data.fromAccount)) demForm++;
                if (data.toAccount && ghiDuLieuVaoOdoo(timInputOdooTheoLabel('to'), data.toAccount)) demForm++;

                if (demForm > 0) {
                    updateStatus(`🎉 XONG (${demForm}/6)`, "#9ece6a");
                } else {
                    updateStatus("⚠️ Lỗi điền dữ liệu", "#f7768e");
                }
            } catch (error) {
                updateStatus("❌ Lỗi xử lý", "#f7768e");
                logMessage(`Lỗi: ${error.message}`);
            }
            e.target.value = '';
        });
    }

    function updateStatus(text, color) {
        const el = document.getElementById('aio-status');
        if (el) { el.innerText = text; el.style.color = color; }
    }

    function logMessage(msg) {
        const el = document.getElementById('aio-log');
        if (el) { el.innerHTML += `<br/>${msg}`; el.scrollTop = el.scrollHeight; }
    }

    // 8. KHỞI TẠO VÀ CHỈ DÙNG MUTATION OBSERVER
    function khoiTaoHeThong() {
        veBangDieuKhien();
        const observer = new MutationObserver(() => {
            if (!document.getElementById('odoo-autofill-hdbank-aio')) {
                veBangDieuKhien();
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        khoiTaoHeThong();
    } else {
        document.addEventListener('DOMContentLoaded', khoiTaoHeThong);
    }
})();
