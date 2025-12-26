import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken 
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
  Plus, 
  Trash2, 
  Search, 
  Package, 
  Minus, 
  Save, 
  Image as ImageIcon,
  AlertCircle,
  Loader2
} from 'lucide-react';

// --- Cấu hình Firebase & Khởi tạo ---
// Lưu ý: Trong môi trường thực tế, bạn sẽ lấy config từ Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyDRFJjd4IsbFSJIuaAR1UgMnMB-gdnEwfo",
  authDomain: "xuanvinhlinhkien.firebaseapp.com",
  projectId: "xuanvinhlinhkien",
  storageBucket: "xuanvinhlinhkien.firebasestorage.app",
  messagingSenderId: "975808621358",
  appId: "1:975808621358:web:f30a0821cb87f8c2b228bf",
  measurementId: "G-KSE9WXBL18"
};
const appId = 'default-app-id';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Tên collection trong Firestore (Tuân thủ quy tắc đường dẫn bắt buộc)
// Chúng ta dùng "public" để demo, trong thực tế bạn nên dùng "users" để bảo mật
const COLLECTION_NAME = 'inventory_items';

export default function App() {
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // State cho form thêm mới
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemImage, setNewItemImage] = useState(''); // URL hoặc Base64
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Xác thực người dùng (Auth)
 useEffect(() => {
    const initAuth = async () => {
      try {
        // Chỉ giữ lại đăng nhập ẩn danh, bỏ phần check token lạ đi
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Lỗi xác thực:", err);
        setError("Không thể kết nối đến hệ thống xác thực.");
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 2. Lắng nghe dữ liệu từ Firestore (Real-time)
  useEffect(() => {
    if (!user) return;

    // Đường dẫn tuân thủ Rule 1: /artifacts/{appId}/public/data/{collectionName}
    const itemsCollection = collection(db, COLLECTION_NAME);
    // Rule 2: Không dùng orderBy phức tạp. Lấy hết về rồi sort ở client
    const q = query(itemsCollection, orderBy('createdAt', 'desc')); 

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sắp xếp theo thời gian tạo mới nhất ở Client
      loadedItems.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      
      setItems(loadedItems);
      setLoading(false);
    }, (err) => {
      console.error("Lỗi tải dữ liệu:", err);
      setError("Không thể tải danh sách linh kiện. Vui lòng thử lại.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Xử lý thêm mới
  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    if (!user) return;

    try {
        const itemsCollection = collection(db, COLLECTION_NAME);
        await addDoc(itemsCollection, {
        name: newItemName,
        quantity: parseInt(newItemQty),
        image: newItemImage || 'https://via.placeholder.com/150?text=No+Image',
        createdAt: serverTimestamp(),
        createdBy: user.uid
      });

      // Reset form
      setNewItemName('');
      setNewItemQty(1);
      setNewItemImage('');
      setIsFormOpen(false);
    } catch (err) {
      console.error("Lỗi thêm mới:", err);
      setError("Có lỗi khi thêm linh kiện.");
    }
  };

  // Xử lý cập nhật số lượng
  const handleUpdateQuantity = async (id, currentQty, change) => {
    if (!user) return;
    const newQty = currentQty + change;
    if (newQty < 0) return;

    try {
      const itemRef = doc(db, COLLECTION_NAME, id);
      await updateDoc(itemRef, { quantity: newQty });
    } catch (err) {
      console.error("Lỗi cập nhật:", err);
    }
  };

  // Xử lý xóa
  const handleDeleteItem = async (id) => {
    if (!user) return;
    // Dùng window.confirm thay vì alert, nhưng tốt nhất là Modal custom (ở đây làm đơn giản)
    if (!window.confirm("Bạn có chắc chắn muốn xóa linh kiện này không?")) return;

    try {
      const itemRef = doc(db, COLLECTION_NAME, id);
      await deleteDoc(itemRef);
    } catch (err) {
      console.error("Lỗi xóa:", err);
    }
  };

  // Xử lý upload ảnh local (Convert sang Base64 để lưu vào Firestore - Giới hạn ảnh nhỏ)
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 1048487) { // Giới hạn ~1MB do giới hạn document Firestore
        alert("Vui lòng chọn ảnh nhỏ hơn 1MB hoặc dùng link ảnh.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewItemImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Filter items search
  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-blue-600 text-white shadow-lg sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Package className="w-8 h-8" />
            <h1 className="text-xl md:text-2xl font-bold">Kho Linh Kiện</h1>
          </div>
          <button 
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="bg-white text-blue-600 px-4 py-2 rounded-full font-semibold hover:bg-blue-50 transition flex items-center gap-2 shadow-sm"
          >
            {isFormOpen ? <Minus size={18} /> : <Plus size={18} />}
            <span className="hidden sm:inline">{isFormOpen ? 'Đóng Form' : 'Thêm Mới'}</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        
        {/* Error Notification */}
        {error && (
          <div className="mb-4 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded shadow-sm flex items-center gap-2">
            <AlertCircle size={20} />
            <p>{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-10">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
          </div>
        )}

        {/* Form Thêm Mới */}
        {isFormOpen && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-slate-200 animate-in slide-in-from-top-4 fade-in duration-300">
            <h2 className="text-lg font-bold mb-4 text-slate-700">Nhập thông tin linh kiện</h2>
            <form onSubmit={handleAddItem} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Tên linh kiện</label>
                <input 
                  type="text" 
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="Ví dụ: Arduino Uno R3, Tụ điện 100uF..."
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>
              
              <div className="flex gap-4">
                <div className="w-1/3">
                  <label className="block text-sm font-medium text-slate-600 mb-1">Số lượng</label>
                  <input 
                    type="number" 
                    value={newItemQty}
                    onChange={(e) => setNewItemQty(e.target.value)}
                    min="0"
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div className="w-2/3">
                  <label className="block text-sm font-medium text-slate-600 mb-1">Hình ảnh</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input 
                      type="text" 
                      value={newItemImage}
                      onChange={(e) => setNewItemImage(e.target.value)}
                      placeholder="Dán link ảnh (URL)..."
                      className="flex-1 px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                    />
                    <div className="relative">
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        id="file-upload"
                      />
                      <label 
                        htmlFor="file-upload"
                        className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg border border-slate-300 flex items-center justify-center gap-1 h-full whitespace-nowrap text-sm font-medium transition"
                      >
                        <ImageIcon size={16} /> Tải ảnh
                      </label>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Dán link ảnh online hoặc tải ảnh nhỏ (max 1MB).</p>
                </div>
              </div>

              <button 
                type="submit" 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-md hover:shadow-lg transition flex justify-center items-center gap-2"
              >
                <Save size={18} /> Lưu vào kho
              </button>
            </form>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative mb-6">
          <input 
            type="text" 
            placeholder="Tìm kiếm linh kiện..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-full border border-slate-200 shadow-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
          />
          <Search className="absolute left-3 top-3.5 text-slate-400 w-5 h-5" />
        </div>

        {/* Inventory Grid */}
        {!loading && filteredItems.length === 0 ? (
          <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-dashed border-slate-300">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg">Kho đang trống hoặc không tìm thấy kết quả.</p>
            <button onClick={() => setIsFormOpen(true)} className="text-blue-600 font-semibold hover:underline mt-2">
              Thêm linh kiện mới ngay
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => (
              <div key={item.id} className="bg-white rounded-xl shadow-sm hover:shadow-md transition border border-slate-100 overflow-hidden flex flex-col">
                {/* Image Area */}
                <div className="h-40 w-full bg-slate-100 relative group overflow-hidden">
                  <img 
                    src={item.image} 
                    alt={item.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://via.placeholder.com/300x200?text=No+Image';
                    }}
                  />
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => handleDeleteItem(item.id)}
                      className="bg-white/90 p-2 rounded-full text-red-500 hover:bg-red-500 hover:text-white shadow-sm transition"
                      title="Xóa linh kiện"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Content Area */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg mb-1 line-clamp-2">{item.name}</h3>
                    <p className="text-xs text-slate-400 mb-3">ID: {item.id.slice(0,8)}...</p>
                  </div>
                  
                  <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <span className="text-xs font-semibold text-slate-500 uppercase">Số lượng</span>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => handleUpdateQuantity(item.id, item.quantity, -1)}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 transition disabled:opacity-50"
                        disabled={item.quantity <= 0}
                      >
                        <Minus size={14} />
                      </button>
                      
                      <span className={`font-mono font-bold text-lg ${item.quantity === 0 ? 'text-red-500' : 'text-blue-600'}`}>
                        {item.quantity}
                      </span>
                      
                      <button 
                        onClick={() => handleUpdateQuantity(item.id, item.quantity, 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 transition"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      
      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-4 py-8 text-center text-slate-400 text-sm">
        <p>© {new Date().getFullYear()} Quản Lý Kho Linh Kiện Cá Nhân</p>
        <p className="text-xs mt-1">Dữ liệu được lưu trữ trên Google Firebase</p>
      </footer>
    </div>
  );
}