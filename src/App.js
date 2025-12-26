import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  serverTimestamp, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { 
  Plus, Trash2, Search, Package, Minus, Save, 
  Image as ImageIcon, Loader2, X, Check, AlertCircle 
} from 'lucide-react';
import Cropper from 'react-easy-crop';
import getCroppedImg from './cropUtils'; 

// --- CẤU HÌNH FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDRFJjd4IsbFSJIuaAR1UgMnMB-gdnEwfo",
  authDomain: "xuanvinhlinhkien.firebaseapp.com",
  projectId: "xuanvinhlinhkien",
  storageBucket: "xuanvinhlinhkien.firebasestorage.app",
  messagingSenderId: "975808621358",
  appId: "1:975808621358:web:f30a0821cb87f8c2b228bf",
  measurementId: "G-KSE9WXBL18"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const COLLECTION_NAME = 'inventory_items';

// --- CẤU HÌNH CLOUDINARY ---
const CLOUD_NAME = "dphexeute"; 
const UPLOAD_PRESET = "kho_linh_kien"; 

export default function App() {
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form State
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemImage, setNewItemImage] = useState(''); 
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // --- CROPPER STATE ---
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isCropping, setIsCropping] = useState(false);

  // Auth
  useEffect(() => {
    const initAuth = async () => {
      try { await signInAnonymously(auth); } 
      catch (err) { console.error("Lỗi xác thực:", err); setError("Lỗi kết nối."); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Data Fetching
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loadedItems.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setItems(loadedItems);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError("Không thể tải danh sách linh kiện.");
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  // --- LOGIC ẢNH ---
  const onFileChange = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) { 
         setError("Ảnh quá lớn (>10MB).");
         return;
      }
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setImageSrc(reader.result);
        setIsCropping(true); 
        setError('');
      });
      reader.readAsDataURL(file);
    }
  };

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const showCroppedImage = useCallback(async () => {
    try {
      const croppedImageBase64 = await getCroppedImg(imageSrc, croppedAreaPixels);
      setNewItemImage(croppedImageBase64);
      setIsCropping(false);
      setImageSrc(null);
      setZoom(1);
    } catch (e) {
      console.error(e);
      setError("Lỗi cắt ảnh.");
    }
  }, [imageSrc, croppedAreaPixels]);

  // Upload Cloudinary
  const uploadToCloudinary = async (base64Image) => {
    const formData = new FormData();
    formData.append("file", base64Image);
    formData.append("upload_preset", UPLOAD_PRESET);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
    if (!response.ok) throw new Error("Lỗi upload Cloudinary");
    const data = await response.json();
    return data.secure_url;
  };

  // CRUD
  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItemName.trim() || !user) return;
    setIsUploading(true);
    try {
      let finalImageUrl = 'https://via.placeholder.com/300?text=No+Image'; 
      if (newItemImage && newItemImage.startsWith('data:image')) {
         finalImageUrl = await uploadToCloudinary(newItemImage);
      } else if (newItemImage) {
         finalImageUrl = newItemImage;
      }
      await addDoc(collection(db, COLLECTION_NAME), {
        name: newItemName,
        quantity: parseInt(newItemQty),
        image: finalImageUrl,
        createdAt: serverTimestamp(),
        createdBy: user.uid
      });
      setNewItemName(''); setNewItemQty(1); setNewItemImage(''); setIsFormOpen(false);
      setError('');
    } catch (err) { 
      console.error(err);
      setError("Lỗi khi lưu. Kiểm tra lại mạng.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteItem = async (id) => {
    if (window.confirm("Xóa linh kiện này?")) {
      try { await deleteDoc(doc(db, COLLECTION_NAME, id)); } 
      catch (err) { setError("Không xóa được."); }
    }
  };

  const handleUpdateQuantity = async (id, qty, change) => {
    if (qty + change >= 0) {
      try { await updateDoc(doc(db, COLLECTION_NAME, id), { quantity: qty + change }); } 
      catch (err) { console.error(err); }
    }
  };

  const filteredItems = items.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-10">
      <header className="bg-blue-600 text-white shadow-lg sticky top-0 z-10 px-4 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2"><Package className="w-8 h-8" /><h1 className="text-xl md:text-2xl font-bold">Kho Linh Kiện</h1></div>
        <button onClick={() => setIsFormOpen(!isFormOpen)} className="bg-white text-blue-600 px-5 py-2.5 rounded-full font-bold flex gap-2 shadow-sm hover:bg-blue-50 transition">
          {isFormOpen ? <Minus size={20} /> : <Plus size={20} />} <span className="hidden sm:inline">{isFormOpen ? 'Đóng' : 'Thêm Mới'}</span>
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {error && <div className="mb-4 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded flex items-center gap-2"><AlertCircle size={20} /><p>{error}</p></div>}
        
        {(loading || isUploading) && (
          <div className="fixed inset-0 bg-black/30 z-50 flex justify-center items-center backdrop-blur-sm">
            <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center">
              <Loader2 className="animate-spin text-blue-600 w-12 h-12 mb-3" />
              <p className="font-bold text-lg text-slate-700">{isUploading ? "Đang xử lý ảnh..." : "Đang tải..."}</p>
            </div>
          </div>
        )}

        {isFormOpen && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border border-slate-200 animate-in slide-in-from-top-4">
            <h2 className="font-bold mb-6 text-2xl text-slate-800">Thêm linh kiện mới</h2>
            
            {isCropping ? (
              <div className="flex flex-col gap-4 animate-in fade-in">
                <div className="relative h-[500px] w-full bg-slate-900 rounded-xl overflow-hidden border-4 border-blue-500 shadow-2xl">
                  <Cropper
                    image={imageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={4 / 3}
                    onCropChange={setCrop}
                    onCropComplete={onCropComplete}
                    onZoomChange={setZoom}
                  />
                </div>
                <div className="flex flex-col gap-3">
                   <div className="flex items-center gap-3 px-2">
                      <span className="text-sm font-bold text-slate-500">Zoom:</span>
                      <input type="range" value={zoom} min={1} max={3} step={0.1} onChange={(e) => setZoom(e.target.value)} className="w-full accent-blue-600 h-2 bg-slate-200 rounded-lg cursor-pointer" />
                   </div>
                   <div className="flex justify-between gap-4 mt-2">
                      <button onClick={() => setIsCropping(false)} className="flex-1 bg-slate-200 text-slate-700 py-3 rounded-xl font-bold flex justify-center items-center gap-2 hover:bg-slate-300 transition text-lg"><X size={20}/> Hủy</button>
                      <button onClick={showCroppedImage} className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold flex justify-center items-center gap-2 hover:bg-green-700 transition shadow-lg text-lg"><Check size={20}/> Xong</button>
                   </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAddItem} className="space-y-6">
                <div>
                  <label className="block text-base font-bold mb-2 text-slate-700">Tên linh kiện</label>
                  <input type="text" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="w-full px-5 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:ring-0 outline-none text-lg" required placeholder="Nhập tên..." />
                </div>
                <div className="flex gap-6">
                  <div className="w-1/3">
                    <label className="block text-base font-bold mb-2 text-slate-700">Số lượng</label>
                    <input type="number" value={newItemQty} onChange={(e) => setNewItemQty(e.target.value)} className="w-full px-5 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none text-lg font-mono" min="0" />
                  </div>
                  <div className="w-2/3">
                    <label className="block text-base font-bold mb-2 text-slate-700">Hình ảnh</label>
                    {newItemImage ? (
                      <div className="relative h-64 w-full bg-slate-50 rounded-xl overflow-hidden border-2 border-slate-300 group">
                        <img src={newItemImage} alt="Preview" className="w-full h-full object-contain" />
                        <button type="button" onClick={() => setNewItemImage('')} className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full shadow-lg hover:bg-red-600 transition"><Trash2 size={20}/></button>
                      </div>
                    ) : (
                      <label className="cursor-pointer bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center h-64 text-slate-500 transition hover:border-blue-400 hover:text-blue-500">
                        <ImageIcon size={40} className="mb-2 opacity-50"/>
                        <span className="text-sm font-bold">Bấm để chọn ảnh</span>
                        <input type="file" accept="image/*" onChange={onFileChange} className="hidden" />
                      </label>
                    )}
                  </div>
                </div>
                <button type="submit" disabled={isUploading} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 shadow-lg transition flex justify-center items-center gap-2 disabled:bg-slate-400 text-lg">
                  <Save size={24} /> {isUploading ? "Đang lưu..." : "Lưu Linh Kiện"}
                </button>
              </form>
            )}
          </div>
        )}

        <div className="relative mb-8">
          <input type="text" placeholder="Tìm kiếm nhanh..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-6 py-4 rounded-full border border-slate-200 shadow-md focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none text-lg" />
          <Search className="absolute left-4 top-4.5 text-slate-400 w-6 h-6" />
        </div>

        {!loading && filteredItems.length === 0 ? (
          <div className="text-center py-16 text-slate-400 bg-white rounded-3xl border-2 border-dashed border-slate-200">
            <Package className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-xl font-medium">Kho chưa có gì cả</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map((item) => (
              <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col hover:shadow-xl transition-shadow duration-300">
                
                {/* --- KHUNG ẢNH DANH SÁCH: TĂNG GẤP ĐÔI (h-80) --- */}
                <div className="h-80 w-full bg-white relative group border-b border-slate-50 p-4">
                  <img src={item.image} alt={item.name} className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105" 
                    onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/300x400?text=No+Image'; }} />
                  <button onClick={() => handleDeleteItem(item.id)} className="absolute top-3 right-3 bg-white/90 backdrop-blur p-2.5 rounded-full text-red-500 shadow-md opacity-0 group-hover:opacity-100 transition hover:bg-red-500 hover:text-white" title="Xóa"><Trash2 size={20} /></button>
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div className="mb-4">
                    <h3 className="font-bold text-slate-800 text-2xl line-clamp-2 leading-tight mb-1">{item.name}</h3>
                    <p className="text-xs text-slate-400 font-mono">#{item.id.slice(0,6)}</p>
                  </div>
                  
                  <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <button onClick={() => handleUpdateQuantity(item.id, item.quantity, -1)} className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center hover:bg-blue-50 text-slate-600 disabled:opacity-30 transition shadow-sm" disabled={item.quantity <= 0}><Minus size={18}/></button>
                    <span className={`font-mono font-bold text-3xl ${item.quantity === 0 ? 'text-red-500' : 'text-blue-600'}`}>{item.quantity}</span>
                    <button onClick={() => handleUpdateQuantity(item.id, item.quantity, 1)} className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center hover:bg-blue-50 text-slate-600 transition shadow-sm"><Plus size={18}/></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="max-w-4xl mx-auto px-4 py-10 text-center text-slate-400 text-sm">
        <p>© {new Date().getFullYear()} Quản Lý Kho Linh Kiện</p>
        <p className="text-xs mt-1">Lưu trữ: Firebase & Cloudinary</p>
      </footer>
    </div>
  );
}