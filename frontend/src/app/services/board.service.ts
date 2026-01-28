import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WardBoardService {
  private API = 'http://localhost:3001/api/board';

  constructor(private http: HttpClient) {}

  getBoard(): Observable<any> {
    return this.http.get(this.API);
  }
}




