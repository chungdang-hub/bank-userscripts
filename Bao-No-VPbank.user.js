// ==UserScript==
// @name         Báo Nợ VPbank
// @namespace    http://tampermonkey.net/
// @version      11.7
// @description  Hỗ trợ đa tài khoản công ty & Tối ưu hiệu năng DOM
// @author       NGOCCHUNG
// @downloadURL  https://raw.githubusercontent.com/chungdang-hub/bank-userscripts/main/Bao-No-VPbank.user.js
// @updateURL    https://raw.githubusercontent.com/chungdang-hub/bank-userscripts/main/Bao-No-VPbank.user.js
// @match        *://farmlink.techcoop.vn/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    let pdfLibLoaded = false;
    let uiObserver = null;

    // 1. TỰ ĐỘNG NHÚNG LÕI XỬ LÝ PDF (Tối ưu hóa load bất đồng bộ)
    function injectPdfEngine() {
        if (window.pdfjsLib) {
            pdfLibLoaded = true;
            updateStatus("● Lõi PDF đã sẵn sàng", "#9ece6a");
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
        script.async = true;
        script.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
            pdfLibLoaded = true;
            updateStatus("● Lõi PDF đã sẵn sàng", "#9ece6a");
            logMessage("✓ Thư viện PDF đã kết nối an toàn.");
        };
        script.onerror = () => {
            updateStatus("❌ Lỗi bảo mật/CDN trình duyệt", "#f7768e");
        };
        document.head.appendChild(script);
    }

    // 2. THUẬT TOÁN ĐA TẦNG TÌM Ô NHẬP ODOO
    function timInputOdooTheoLabel(chuoiLabel) {
        if (chuoiLabel === 'detail') {
            const elDetail = document.getElementById('detail') || document.querySelector('textarea#detail, .o_input#detail, [name="detail"]');
            if (elDetail) return elDetail;
        }

        const direct = document.querySelector(`input[name="${chuoiLabel}"], [name="${chuoiLabel}"] input, input[id*="${chuoiLabel}"], [data-fieldname="${chuoiLabel}"] input`);
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
            for (const n of nameMap[chuoiLabel]) {
                const el = document.querySelector(`input[name="${n}"], textarea[name="${n}"], [name="${n}"] textarea, [name*="${n}"] textarea`);
                if (el) return el;
            }
        }

        const tatCaLabels = document.querySelectorAll('label, .o_form_label, .o_cell span');
        for (const label of tatCaLabels) {
            const text = label.textContent.trim().toLowerCase();
            let khop = false;

            if (chuoiLabel === 'date' && (text === 'date' || text === 'ngày')) khop = true;
            if (chuoiLabel === 'ref' && (text === 'ref' || text === 'mã giao dịch' || text === 'mã ref')) khop = true;
            if (chuoiLabel === 'amount' && (text === 'amount' || text === 'số tiền')) khop = true;
            if (chuoiLabel === 'detail' && (text === 'detail' || text.includes('nội dung') || text.includes('ghi chú') || text === 'diễn giải')) khop = true;

            if (chuoiLabel === 'from' && (text.includes('from account') || text.includes('tài khoản nguồn') || text.includes('tài khoản đi')) && !text.includes('name') && !text.includes('tên')) khop = true;
            if (chuoiLabel === 'to' && (text.includes('to account') || text.includes('tài khoản đích') || text.includes('tài khoản đến')) && !text.includes('name') && !text.includes('tên')) khop = true;

            if (khop) {
                if (label.getAttribute('for')) {
                    const input = document.getElementById(label.getAttribute('for'));
                    if (input) return input;
                }
                const oChuaLabel = label.closest('.o_cell') || label.parentElement;
                if (oChuaLabel) {
                    const inputTrongO = oChuaLabel.querySelector('input, textarea');
                    if (inputTrongO) return inputTrongO;

                    const oKeTiep = oChuaLabel.nextElementSibling;
                    if (oKeTiep) {
                        const inputKe = oKeTiep.querySelector('input, textarea');
                        if (inputKe) return inputKe;
                    }
                }
            }
        }
        return null;
    }

    // 3. ĐỒNG BỘ DỮ LIỆU VÀO Ô CHỈ ĐỊNH (Native Setter xịn)
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
                element.dispatchEvent(new Event('blur', { bubbles: true }));
            } else {
                element.textContent = giaTri;
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }

            element.style.backgroundColor = 'rgba(26, 188, 156, 0.3)';
            setTimeout(() => { element.style.backgroundColor = ''; }, 2000);
            return true;
        } catch (e) { return false; }
    }

    // 4. BỘ PHÂN TÍCH CHUỖI v11.7 (Tối ưu hóa Regex & Đa tài khoản công ty)
    function trichXuatDuLieuVPBank(vanBan) {
        const ketQua = { ngay: '', soTien: '', ref: '', fromAccount: '', toAccount: '', detail: '' };

        const textChuan = vanBan.replace(/\s+/g, ' ');
        const textSachToanVan = textChuan.replace(/",\s*"/g, ' ').replace(/"/g, ' ').replace(/\s+/g, ' ').trim();

        // 1. Quét Mã Ref (FT...)
        const mRef = textChuan.match(/(FT[A-Z0-9]{10,})/i);
        if (mRef) ketQua.ref = mRef[1];

        // 2. Quét Ngày giao dịch
        const mNgay = textChuan.match(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/);
        if (mNgay) ketQua.ngay = mNgay[1].replace(/-/g, '/');

        // 3. Quét Số tiền
        const mSoTien = textChuan.match(/\b([\d,.]+)\s*VND/i);
        if (mSoTien) {
            let chuoiSo = mSoTien[1].trim();
            if (chuoiSo.endsWith('.') || chuoiSo.endsWith(',')) chuoiSo = chuoiSo.slice(0, -1);
            ketQua.soTien = chuoiSo;
        }

        // 4. TRÍCH XUẤT DIỄN GIẢI CHUYÊN BIỆT
        let noiDungTimThay = "";

        const bieuThucTrucTiep = /(Thanh\s*toan|Chuyen\s*khoan|Noi\s*dung|Chuyen\s*tien|Tra\s*tien|Ck|Tt)\s+([\s\S]*?)(?=(?:Diễn\s*giải|Details|Remarks|Chi\s*nhánh|Branch|Số\s*tiền|Amount|Bằng\s*số|Bằng\s*chữ|Mã\s*giao\s*dịch|Transaction|Số\s*tài\s*khoản|Account|Ngày|Date|Tên\s*khách|Địa\s*chỉ|VND|ĐẠI\s*DIỆN|$))/i;
        const khopTrucTiep = textSachToanVan.match(bieuThucTrucTiep);
        if (khopTrucTiep) {
            noiDungTimThay = khopTrucTiep[0].trim();
        }

        if (!noiDungTimThay) {
            const bieuThucBaoVay = /(?:Diễn giải|Details|Remarks|Nội dung thanh toán)[:\s]*([\s\S]*?)(?:VND\s+ĐẠI DIỆN|ĐẠI DIỆN VPBANK|Phiếu này được in|Chi nhánh|Branch|$)/i;
            const khopBaoVay = textSachToanVan.match(bieuThucBaoVay);
            if (khopBaoVay && khopBaoVay[1].trim().length > 3 && khopBaoVay[1].trim().length < 250) {
                noiDungTimThay = khopBaoVay[1].trim();
            }
        }

        if (noiDungTimThay) {
            noiDungTimThay = noiDungTimThay.replace(/^(?:Nội dung thanh toán|Details|Diễn giải|Remarks|Nội dung giao dịch|Nội dung)[:\s/|\\-]*/i, '').trim();

            const cacCumTuHeThongCatDuoi = [
                /\s+Ngan\s*hang.*/i, /\s+Bank.*/i, /\s+Customer.*/i, /\s+Adddress.*/i, /\s+Tax.*/i,
                /\s+Mã\s*khách.*/i, /\s+Tên\s*khách.*/i, /\s+Địa\s*chỉ.*/i, /\s+Số\s*tài\s*khoản.*/i, /\s+Tên\s*ngân\s*hàng.*/i
            ];

            for (const bieuThucRac of cacCumTuHeThongCatDuoi) {
                if (bieuThucRac.test(noiDungTimThay)) {
                    noiDungTimThay = noiDungTimThay.split(bieuThucRac)[0].trim();
                }
            }

            ketQua.detail = noiDungTimThay.replace(/[\s,.:;"'’`\-_|\\/]+$/, '').trim();
        }

        // 5. PHÂN BỔ TÀI KHOẢN ĐA CÔNG TY
        const DS_TK_CONG_TY = ["358722873", "386099324"];
        const tatCaSo = [...textChuan.matchAll(/\b\d{9,15}\b/g)].map(m => m[0]);
        const dsTaiKhoan = [];
        for (const so of tatCaSo) {
            if (so.length === 10 && (so.startsWith('03') || so.startsWith('01'))) continue;
            if (!dsTaiKhoan.includes(so)) dsTaiKhoan.push(so);
        }

        // Tìm tài khoản khớp với danh sách công ty
        let tkCongTyTimThay = dsTaiKhoan.find(tk => DS_TK_CONG_TY.includes(tk));

        if (tkCongTyTimThay) {
            // Đây là Báo Nợ -> Tài khoản nguồn (fromAccount) là tài khoản công ty
            ketQua.fromAccount = tkCongTyTimThay;
            const tkDoiTac = dsTaiKhoan.find(tk => tk !== tkCongTyTimThay);
            if (tkDoiTac) ketQua.toAccount = tkDoiTac;
        } else if (dsTaiKhoan.length >= 2) {
            ketQua.fromAccount = dsTaiKhoan[0];
            ketQua.toAccount = dsTaiKhoan[1];
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
                        textTong += content.items.map(item => item.str).join(" ") + "\n";
                    }
                    resolve(textTong);
                } catch (err) { reject(err); }
            };
            reader.onerror = () => reject(new Error("Lỗi đọc file từ thiết bị."));
            reader.readAsArrayBuffer(file);
        });
    }

    // 6. KHỞI TẠO BẢNG ĐIỀU KHIỂN GIAO DIỆN
    function veBangDieuKhien() {
        if (document.getElementById('odoo-autofill-v9')) return;
        if (!document.body) return;

        // Tắt observer tạm thời để tránh loop vô hạn khi vẽ UI mới
        if (uiObserver) uiObserver.disconnect();

        const container = document.createElement('div');
        container.id = 'odoo-autofill-v9';
        container.style = `
            position: fixed; top: 90px; right: 20px; z-index: 1000000;
            background: #1a1b26; color: #a9b1d6; padding: 15px;
            border-radius: 8px; width: 260px; font-family: sans-serif;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 2px solid #f7768e;
        `;

        container.innerHTML = `
            <div style="font-weight: bold; color: #f7768e; font-size: 13px; margin-bottom: 6px; text-align: center; border-bottom: 1px solid #444b6a; padding-bottom: 4px;">
                🦊 BÁO NỢ VPbank AUTOFILL
            </div>
            <div id="v9-status" style="font-size: 11px; color: #ff9e64; font-weight: bold; margin-bottom: 10px; text-align: center;">
                ● Đang kết nối lõi PDF...
            </div>

            <button id="v9-btn-test" style="width: 100%; background: #24283b; color: #f7768e; border: 1px solid #f7768e; padding: 7px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; margin-bottom: 8px;">
                🔍 KIỂM TRA FORM ODOO
            </button>

            <button id="v9-btn-file" style="width: 100%; background: #f7768e; color: #1a1b26; border: none; padding: 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">
                📁 CHỌN FILE BÁO NỢ VPbank
            </button>
            <input type="file" id="v9-file-input" accept="application/pdf" style="display: none;" />

            <div id="v9-log" style="font-size: 10px; color: #a9b1d6; margin-top: 10px; max-height: 120px; overflow-y: auto; background: #10101a; padding: 6px; border-radius: 4px; border: 1px solid #24283b; line-height: 1.4;">
                HỆ THỐNG v11.7: Đã tối ưu hóa hiệu năng DOM. Sẵn sàng xử lý phôi VPBank.
            </div>
        `;

        document.body.appendChild(container);
        injectPdfEngine();

        // Đăng ký Event Listeners
        document.getElementById('v9-btn-test').addEventListener('click', function() {
            const fields = ['date', 'ref', 'amount', 'from', 'to', 'detail'];
            let foundCount = 0;
            logMessage("--- Kiểm tra form ---");

            fields.forEach(f => {
                const el = timInputOdooTheoLabel(f);
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

        document.getElementById('v9-btn-file').addEventListener('click', function() {
            if (!pdfLibLoaded) { alert("Vui lòng đợi giây lát, lõi PDF đang kết nối!"); return; }
            document.getElementById('v9-file-input').click();
        });

        document.getElementById('v9-file-input').addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file || !pdfLibLoaded) return;

            updateStatus("⏳ Đang xử lý...", "#ff9e64");
            logMessage(`--- File: ${file.name} ---`);

            try {
                const nutUploadOdoo = document.querySelector('input[type="file"]:not(#v9-file-input)');
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
                const data = trichXuatDuLieuVPBank(vanBanRaw);

                logMessage(`✓ Ngày: ${data.ngay || 'Trống'}`);
                logMessage(`✓ Số tiền: ${data.soTien || 'Trống'}`);
                logMessage(`✓ Mã Ref: ${data.ref || 'Trống'}`);
                logMessage(`✓ Nguồn: ${data.fromAccount || 'Trống'}`);
                logMessage(`✓ Đích: ${data.toAccount || 'Trống'}`);
                logMessage(`✓ Diễn giải: ${data.detail || 'Trống'}`);

                let demForm = 0;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('date'), data.ngay)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('ref'), data.ref)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('amount'), data.soTien)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('detail'), data.detail)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('from'), data.fromAccount)) demForm++;
                if (ghiDuLieuVaoOdoo(timInputOdooTheoLabel('to'), data.toAccount)) demForm++;

                if (demForm > 0) {
                    updateStatus(`🎉 HOÀN THÀNH (${demForm}/6)`, "#9ece6a");
                    logMessage(`→ Điền tự động thành công.`);
                } else {
                    updateStatus("⚠️ Lỗi dữ liệu form", "#f7768e");
                }
            } catch (error) {
                updateStatus("❌ Lỗi hệ thống", "#f7768e");
                logMessage(`Lỗi: ${error.message}`);
            }
            e.target.value = '';
        });

        // Bật lại observer sau khi vẽ xong để phòng hờ Odoo tải lại trang (Single Page App)
        kichHoatHeThongTheoDoi();
    }

    function updateStatus(text, color) {
        const el = document.getElementById('v9-status');
        if (el) { el.innerText = text; el.style.color = color; }
    }

    function logMessage(msg) {
        const el = document.getElementById('v9-log');
        if (el) { el.innerHTML += `<br/>${msg}`; el.scrollTop = el.scrollHeight; }
    }

    function kichHoatHeThongTheoDoi() {
        if (uiObserver) return;
        uiObserver = new MutationObserver(() => {
            if (!document.getElementById('odoo-autofill-v9') && document.body) {
                veBangDieuKhien();
            }
        });
        uiObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    // Khởi chạy
    if (document.body) veBangDieuKhien();
    else document.addEventListener('DOMContentLoaded', veBangDieuKhien);

    kichHoatHeThongTheoDoi();

})();
