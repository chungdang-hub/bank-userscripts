// ==UserScript==
// @name         HSBC
// @namespace    http://tampermonkey.net/
// @version      20.0
// @downloadURL  https://raw.githubusercontent.com/chungdang-hub/bank-userscripts/main/HSBCbank.user.js
// @updateURL    https://raw.githubusercontent.com/chungdang-hub/bank-userscripts/main/HSBCbank.user.js
// @author       NGOCCHUNG
// @match        *://farmlink.techcoop.vn/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // CẤU HÌNH TÀI KHOẢN CÔNG TY
    const TAI_KHOAN_CONG_TY = "090688433001";
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
        script.onerror = () => { updateStatus("❌ Lỗi bảo mật trình duyệt", "#f7768e"); };
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

    // 3. ĐỒNG BỘ DỮ LIỆU VÀO Ô CHỈ ĐỊNH
    function ghiDuLieuVaoOdoo(element, giaTri, mauHighlight) {
        if (!element || giaTri === undefined || giaTri === null) return false;
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

            element.style.backgroundColor = mauHighlight || 'rgba(0, 229, 255, 0.2)';
            setTimeout(() => { element.style.backgroundColor = ''; }, 2000);
            return true;
        } catch (e) { return false; }
    }

    // 4. BỘ PHÂN TÍCH NÂNG CẤP THÔNG MINH
    function boPhanTichTongHopHSBC(vanBanRaw) {
        let textChuan = vanBanRaw.replace(/"\s*,\s*"/g, ' ');
        textChuan = textChuan.replace(/["\r\n]+/g, ' ');
        textChuan = textChuan.replace(/\s+/g, ' ').trim();

        // THUẬT TOÁN ĐÁNH GIÁ SÂU: Phân biệt luồng Báo Nợ / Báo Có dựa trên ví trí dữ liệu thực tế
        let laBaoCo = false;
        if (/ID người khởi tạo/i.test(textChuan)) {
            laBaoCo = true;
        } else if (/Số tiền ghi có\s*VND\s*[\d,.]+/i.test(textChuan)) {
            laBaoCo = true;
        } else if (/Chi tiết ghi nợ/i.test(textChuan) && /Chi tiết ghi có/i.test(textChuan)) {
            // Nếu tệp chứa cả hai nhãn, kiểm tra xem phân đoạn "Ghi nợ" có chứa tiền thật không
            let doanGhiNo = textChuan.match(/Chi tiết ghi nợ([\s\S]*?)Chi tiết ghi có/i);
            if (doanGhiNo && /VND\s*[\d,.]+/i.test(doanGhiNo[1]) && !/Số tiền ròng Không có sẵn/i.test(doanGhiNo[1])) {
                laBaoCo = false; // Phân đoạn ghi nợ có tiền -> Đích thị là Báo Nợ
            } else {
                laBaoCo = true;
            }
        } else if (/Chi tiết ghi có/i.test(textChuan) && !/Chi tiết ghi nợ/i.test(textChuan)) {
            laBaoCo = true;
        }

        let loaiFile = laBaoCo ? "BÁO CÓ" : "BÁO NỢ";

        let ketQua = {
            type: loaiFile,
            ngay: '',
            soTien: '',
            ref: '',
            fromAccount: laBaoCo ? '' : TAI_KHOAN_CONG_TY,
            toAccount: laBaoCo ? TAI_KHOAN_CONG_TY : '',
            detail: ''
        };

        // --- TRÍCH XUẤT NGÀY GIAO DỊCH ---
        const mNgay = textChuan.match(/(?:Ngày hiệu lực|Thông tin chi tiết vào)\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
        if (mNgay) {
            const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
            let day = mNgay[1].padStart(2, '0');
            let mon = months[mNgay[2].toLowerCase()];
            ketQua.ngay = `${day}/${mon}/${mNgay[3]}`;
        }

        // --- TRÍCH XUẤT MÃ REF ---
        const mRef = textChuan.match(/Mã tham chiếu ngân(?: hàng)?\s+([A-Z0-9_-\s]{4,25}?)(?=\s+Mã tham chiếu|\s+Chú giải|\s+Chủ giải|\s+Loại tiền tệ|\s+Chi tiết|$)/i) ||
                     textChuan.match(/Mã tham chiếu khách hàng\s+([A-Z0-9_-\s]{4,25}?)(?=\s+Mã tham chiếu|\s+Chú giải|\s+Chủ giải|\s+Loại tiền tệ|\s+Chi tiết|$)/i) ||
                     textChuan.match(/Mã tham chiếu xuyên suốt\s+([A-Z0-9_-]+)/i);
        if (mRef) ketQua.ref = mRef[1].trim();

        // --- XỬ LÝ LOGIC THEO LUỒNG ĐÃ ĐỊNH DANH ---
        if (laBaoCo) {
            // LOẠI GIAO DỊCH: BÁO CÓ
            const mSoTienCo = textChuan.match(/(?:Số tiền ghi có|Số tiền tổng)\s*VND\s*([\d,.]+)/i);
            if (mSoTienCo) ketQua.soTien = mSoTienCo[1].trim().replace(/\.00$/, '');

            const mFromAccCo = textChuan.match(/ID người khởi tạo\s*(\d+)/i);
            if (mFromAccCo) ketQua.fromAccount = mFromAccCo[1].trim();

            const mDetailCo = textChuan.match(/Chú giải bổ sung\s+([\s\S]*?)(?=Chi tiết ghi nợ|Tên người thụ hưởng|Tài khoản|Chi tiết ghi có)/i);
            if (mDetailCo) {
                let tamDetail = mDetailCo[1].trim();
                tamDetail = tamDetail.replace(/(Mã tham chiếu khách hàng|Ngày ra lệnh thanh toán|Loại tiền tệ\s*\/\s*Số tiền được chỉ thị|Phí\s*VND|Tỉ giá hối đoái được chỉ thị|Mã tham chiếu ngân hàng|Mã tham chiếu liên quan)[\s\S]*/i, '');
                ketQua.detail = tamDetail.trim();
            }
        } else {
            // LOẠI GIAO DỊCH: BÁO NỢ
            // Ưu tiên 1: Lấy số tiền thực trả tại bảng thanh toán phí riêng
            const mSoTienThanhToan = textChuan.match(/Loại tiền tệ thanh toán\s*VND\s*Số tiền\s*([\d,.]+)/i);
            if (mSoTienThanhToan) {
                ketQua.soTien = mSoTienThanhToan[1].trim().replace(/\.00$/, '');
            } else {
                // Ưu tiên 2: Quét số tiền ròng nợ cơ bản
                const mSoTienNo = textChuan.match(/(?:Số tiền ròng|Số tiền ghi nợ|Số tiền đã ghi nợ|Số tiền thanh toán)\s*(?::\s*)?(?:VND)?\s*(-?\s*[\d,.]+)/i) ||
                                 textChuan.match(/VND\s*-\s*([\d,.]+)/i);
                if (mSoTienNo) {
                    let chuoiTien = mSoTienNo[1].replace(/-/g, '').trim();
                    ketQua.soTien = chuoiTien.replace(/\.00$/, '');
                }
            }

            const mFromAccNo = textChuan.match(/Số tài khoản\s+([\d-]+)/i);
            if (mFromAccNo) ketQua.fromAccount = mFromAccNo[1].replace(/-/g, '').trim();

            const mToAccNo = textChuan.match(/(?:Tài khoản thụ hưởng|Tài khoản với ngân hàng)\s*[:\-#]?\s*([0-9]{8,16})/i);
            if (mToAccNo) ketQua.toAccount = mToAccNo[1].trim();

            // Trích xuất cân bằng nội dung chi tiết/chủ giải
            let chitietNo = "";
            const mCTNo = textChuan.match(/Chi tiết thanh toán\s+([\s\S]*?)(?=Tên người thụ hưởng|Tài khoản thụ hưởng|Mã tham chiếu|Ngày hiệu lực|Thông tin giữa|$)/i);
            if (mCTNo && !mCTNo[1].includes("Không có sẵn")) {
                chitietNo = mCTNo[1].replace(/(?:Địa chỉ|VIETNAM JSC|Tên|Ngân hàng)[\s\S]*/gi, '').trim();
            }

            let chugiaiNo = "";
            const mCGNo = textChuan.match(/(?:Chú giải bổ sung|Chủ giải bổ sung)\s+([\s\S]*?)(?=Mã tham chiếu|Chi tiết thanh toán|Tên người thụ hưởng|Chi tiết ghi nợ|$)/i);
            if (mCGNo) chugiaiNo = mCGNo[1].trim();

            let detailChuanNo = (chitietNo.length > 15) ? chitietNo : chugiaiNo;
            if (!detailChuanNo) detailChuanNo = chugiaiNo || chitietNo;

            if (detailChuanNo) {
                detailChuanNo = detailChuanNo.replace(/(?:Tên người thụ hưởng|Tài khoản thụ hưởng|Số tiền đã trả|Số tiền đã ghi nợ|Tỷ giá hối đoái|Ngày hiệu lực|Thông tin giữa các ngân hàng)[\s\S]*/gi, '');
                ketQua.detail = detailChuanNo.trim();
            }
        }

        return ketQua;
    }

    // 5. ĐỌC FILE PDF
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

    // 6. KHỞI TẠO GIAO DIỆN HỢP NHẤT
    function veBangDieuKhienTongHop() {
        if (document.getElementById('odoo-autofill-hsbc-all')) return;

        const container = document.createElement('div');
        container.id = 'odoo-autofill-hsbc-all';
        container.style = `
            position: fixed; top: 120px; right: 20px; z-index: 1000000;
            background: #1a1b26; color: #a9b1d6; padding: 15px;
            border-radius: 8px; width: 270px; font-family: sans-serif;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 2px solid #bb9af7;
            transition: border-color 0.3s ease;
        `;

        container.innerHTML = `
            <div id="hsbc-title" style="font-weight: bold; color: #bb9af7; font-size: 13px; margin-bottom: 6px; text-align: center; border-bottom: 1px solid #444b6a; padding-bottom: 4px; letter-spacing: 0.5px;">
                DỮ LIỆU HSBC AUTOFILL
            </div>
            <div id="hsbc-status" style="font-size: 11px; color: #9ece6a; font-weight: bold; margin-bottom: 10px; text-align: center;">
                ● Sẵn sàng (Hệ thống tổng hợp)
            </div>
            <button id="hsbc-btn-test" style="width: 100%; background: #24283b; color: #bb9af7; border: 1px solid #bb9af7; padding: 7px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; margin-bottom: 8px;">
                🔍 KIỂM TRA PHÙ HỢP FORM ODOO
            </button>
            <button id="hsbc-btn-file" style="width: 100%; background: #bb9af7; color: #1a1b26; border: none; padding: 11px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">
                📁 CHỌN FILE BÁO NỢ / BÁO CÓ
            </button>
            <input type="file" id="hsbc-file-input" accept="application/pdf" style="display: none;" />
            <div id="hsbc-log" style="font-size: 10px; color: #a9b1d6; margin-top: 10px; max-height: 130px; overflow-y: auto; background: #10101a; padding: 6px; border-radius: 4px; border: 1px solid #24283b; line-height: 1.4;">
                [Hợp nhất v20.1]: Sửa lỗi bóc tách sai luồng giao dịch nợ có phí ẩn. Hệ thống sẵn sàng nhận tệp.
            </div>
        `;

        document.body.appendChild(container);
        injectPdfEngine();

        document.getElementById('hsbc-btn-test').addEventListener('click', function() {
            const fields = ['date', 'ref', 'amount', 'from', 'to', 'detail'];
            let foundCount = 0;
            logMessage("--- Kiểm tra form ---");
            fields.forEach(f => {
                let el = timInputOdooTheoLabel(f);
                if (el) {
                    foundCount++;
                    el.style.backgroundColor = '#ffeaa7';
                    setTimeout(() => { el.style.backgroundColor = ''; }, 2000);
                    logMessage(`✓ Khớp ô: [${f.toUpperCase()}]`);
                } else { logMessage(`❌ Trượt ô: [${f.toUpperCase()}]`); }
            });
            logMessage(`Kết quả: Tìm thấy ${foundCount}/6 ô nhập.`);
        });

        document.getElementById('hsbc-btn-file').addEventListener('click', function() {
            if (!pdfLibLoaded) { alert("Vui lòng đợi giây lát, lõi PDF đang kết nối!"); return; }
            document.getElementById('hsbc-file-input').click();
        });

        document.getElementById('hsbc-file-input').addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file || !pdfLibLoaded) return;

            updateStatus("⏳ Đang phân tích...", "#ff9e64");
            logMessage(`--- Xử lý File: ${file.name} ---`);

            try {
                const nutUploadOdoo = document.querySelector('input[type="file"]:not(#hsbc-file-input)');
                if (nutUploadOdoo) {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    nutUploadOdoo.files = dataTransfer.files;
                    nutUploadOdoo.dispatchEvent(new Event('change', { bubbles: true }));
                    logMessage("✓ Đã đính kèm tệp gốc vào hệ thống.");
                }
            } catch (errUpload) {}

            try {
                const vanBanRaw = await xuLyDocFilePDF(file);
                const data = boPhanTichTongHopHSBC(vanBanRaw);

                // Đồng bộ màu giao diện theo loại tệp chuẩn xác
                let mauChuDao = (data.type === "BÁO CÓ") ? "#1abc9c" : "#00e5ff";
                let mauNenHighlight = (data.type === "BÁO CÓ") ? "rgba(26, 188, 156, 0.2)" : "rgba(0, 229, 255, 0.2)";

                document.getElementById('odoo-autofill-hsbc-all').style.borderColor = mauChuDao;
                document.getElementById('hsbc-title').style.color = mauChuDao;
                document.getElementById('hsbc-title').innerText = `💥 ĐÃ NHẬN DIỆN: ${data.type}`;

                logMessage(`▶ Loại tài liệu: ${data.type}`);
                logMessage(`✓ Ngày giao dịch: ${data.ngay || 'Trống'}`);
                logMessage(`✓ Số tiền: ${data.soTien || 'Trống'}`);
                logMessage(`✓ Mã Ref: ${data.ref || 'Trống'}`);
                logMessage(`✓ Tài khoản đi (From): ${data.fromAccount || 'Trống'}`);
                logMessage(`✓ Tài khoản đến (To): ${data.toAccount || 'Trống'}`);
                logMessage(`✓ Diễn giải: ${data.detail || 'Trống'}`);

                let demForm = 0;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('date'), data.ngay, mauNenHighlight)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('ref'), data.ref, mauNenHighlight)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('amount'), data.soTien, mauNenHighlight)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('detail'), data.detail, mauNenHighlight)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('from'), data.fromAccount, mauNenHighlight)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('to'), data.toAccount, mauNenHighlight)) demForm++;

                if (demForm > 0) {
                    updateStatus(`🎉 HOÀN THÀNH ${data.type} (${demForm}/6)`, "#9ece6a");
                    logMessage(`→ Điền form dữ liệu thành công.`);
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
        const el = document.getElementById('hsbc-status');
        if (el) { el.innerText = text; el.style.color = color; }
    }

    function logMessage(msg) {
        const el = document.getElementById('hsbc-log');
        if (el) { el.innerHTML += `<br/>${msg}`; el.scrollTop = el.scrollHeight; }
    }

    if (document.body) veBangDieuKhienTongHop();
    else document.addEventListener('DOMContentLoaded', veBangDieuKhienTongHop);

    const observer = new MutationObserver(() => {
        if (!document.getElementById('odoo-autofill-hsbc-all') && document.body) veBangDieuKhienTongHop();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

})();
